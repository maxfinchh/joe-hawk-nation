import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { getAuth, signOut, deleteUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import Purchases from 'react-native-purchases';

export default function ProfileScreen() {
  const auth = getAuth();
  const firestore = getFirestore();
  const navigation = useNavigation();

  const [userEmail, setUserEmail] = useState('');
  const [premiumStatus, setPremiumStatus] = useState(null);

  const PRIVACY_POLICY_URL = 'https://app.termly.io/dashboard/website/b199056e-e8fd-4ec9-9064-29a431a2c10b/privacy-policy';

  const handleOpenPrivacyPolicy = async () => {
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (!supported) {
        Alert.alert('Cannot open link', 'Your device could not open the Privacy Policy link.');
        return;
      }
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch (e) {
      console.warn('Failed to open privacy policy:', e);
      Alert.alert('Error', 'Could not open the Privacy Policy. Please try again.');
    }
  };

  useEffect(() => {
    const fetchUserInfo = async () => {
      const user = auth.currentUser;
      if (user) {
        setUserEmail(user.email);

        const docRef = doc(firestore, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPremiumStatus(data.premium ? 'Premium User' : 'Free User');
        } else {
          setPremiumStatus('User document not found');
        }
      }
    };

    fetchUserInfo();

    const rcUser = auth.currentUser;
    Purchases.configure({
      apiKey: 'appl_mieNuuRVDtnWaueMwwMXREAcLdt',
      appUserID: rcUser?.uid,
    });

    const checkRevenueCat = async () => {
      const purchaserInfo = await Purchases.getCustomerInfo();
      if (purchaserInfo.entitlements.active['Joe Hawk Nation Pro']) {
        const user = auth.currentUser;
        if (user) {
          const userRef = doc(firestore, 'users', user.uid);
          await setDoc(userRef, { premium: true }, { merge: true });
          setPremiumStatus('Premium User');
        }
      }
    };
    checkRevenueCat();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This will permanently delete your account and any stored data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (!user) {
                alert('No user is currently signed in.');
                return;
              }

              // Delete the user document from Firestore (must succeed)
              const userRef = doc(firestore, 'users', user.uid);
              await deleteDoc(userRef);

              // Best-effort: log out RevenueCat user (optional)
              try {
                await Purchases.logOut();
              } catch (e) {
                // Ignore if not configured / already logged out
              }

              // Delete Firebase Auth user (may require recent login)
              await deleteUser(user);

              // Send back to login screen
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              console.error('Error deleting account:', error);

              // Common case: Firebase requires recent authentication
              const code = error?.code || '';
              if (code === 'auth/requires-recent-login') {
                alert('For security, please log out and log back in, then try deleting your account again.');
              } else {
                alert('Could not delete account. If this keeps happening, it\'s usually Firestore permissions/rules.');
              }
            }
          },
        },
      ]
    );
  };

  const handleRestorePurchases = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        alert('Please sign in first.');
        return;
      }

      const customerInfo = await Purchases.restorePurchases();
      const hasPro = !!customerInfo.entitlements.active['Joe Hawk Nation Pro'];

      const userRef = doc(firestore, 'users', user.uid);

      // Ensure the doc exists and update premium flag
      await setDoc(
        userRef,
        { email: user.email ?? '', premium: hasPro },
        { merge: true }
      );

      setPremiumStatus(hasPro ? 'Premium User' : 'Free User');
      alert(
        hasPro
          ? 'Purchases restored — Premium unlocked!'
          : 'No active purchases found for this Apple ID.'
      );
    } catch (e) {
      console.warn('Restore purchases failed:', e);
      alert('Could not restore purchases. Please try again.');
    }
  };

  const handleUpgradeToPremium = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in before upgrading to premium.');
        return;
      }

      // First check Firestore premium flag
      const userRef = doc(firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const firestorePremium = userSnap.exists() && userSnap.data()?.premium === true;

      // Also check RevenueCat entitlement directly
      const customerInfo = await Purchases.getCustomerInfo();
      const hasEntitlement = !!customerInfo.entitlements.active['Joe Hawk Nation Pro'];

      if (firestorePremium || hasEntitlement) {
        await setDoc(userRef, { email: user.email ?? '', premium: true }, { merge: true });
        setPremiumStatus('Premium User');
        Alert.alert('Already Premium', 'You already have Joe Hawk Premium.');
        return;
      }

      const offerings = await Purchases.getOfferings();
      const offering = offerings.current;

      if (!offering || offering.availablePackages.length === 0) {
        Alert.alert('Purchase Unavailable', 'No premium purchase package is currently available.');
        return;
      }

      const purchaseResult = await Purchases.purchasePackage(offering.availablePackages[0]);
      const updatedCustomerInfo = purchaseResult?.customerInfo ?? purchaseResult;
      const nowHasPro = !!updatedCustomerInfo?.entitlements?.active?.['Joe Hawk Nation Pro'];

      if (nowHasPro) {
        await setDoc(
          userRef,
          { email: user.email ?? '', premium: true },
          { merge: true }
        );
        setPremiumStatus('Premium User');
        Alert.alert('Success', 'Upgraded to Premium!');
      } else {
        Alert.alert(
          'Purchase Completed',
          'Your purchase finished, but premium was not unlocked yet. Please tap Restore Purchases.'
        );
      }
    } catch (e) {
      if (!e?.userCancelled) {
        console.warn('Purchase failed:', e);

        const message = String(e?.message || '').toLowerCase();
        const code = String(e?.code || '').toLowerCase();

        if (message.includes('already') || code.includes('already')) {
          Alert.alert('Already Premium', 'You already purchased Joe Hawk Premium. Try Restore Purchases if needed.');
        } else {
          Alert.alert('Purchase Error', 'Something went wrong during purchase. Please try again or tap Restore Purchases.');
        }
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Email: {userEmail}</Text>
      <Text style={styles.text}>Status: {premiumStatus}</Text>
      <TouchableOpacity onPress={handleLogout}>
        <Text style={{ color: 'blue', marginTop: 20 }}>Log Out</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleDeleteAccount}>
        <Text style={{ color: 'red', marginTop: 20 }}>Delete Account</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleRestorePurchases}>
        <Text style={{ color: 'purple', marginTop: 20 }}>Restore Purchases</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleOpenPrivacyPolicy}>
        <Text style={{ color: 'blue', marginTop: 20 }}>Privacy Policy</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleUpgradeToPremium}>
        <Text style={{ color: 'green', marginTop: 20 }}>Upgrade to Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    fontSize: 18,
    marginBottom: 10,
  },
});