import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, ScrollView } from 'react-native';
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

  const PRIVACY_POLICY_URL = 'https://maxfinchh.github.io/joe-hawk-nation/privacy.html';
  const TERMS_URL = 'https://maxfinchh.github.io/joe-hawk-nation/terms.html';
  const GUIDELINES_URL = 'https://maxfinchh.github.io/joe-hawk-nation/guidelines.html';
  const PREMIUM_ENTITLEMENT_ID = 'Single Purchase';

  const handleOpenLink = async (url, label) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Cannot open link', `Your device could not open the ${label} link.`);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.warn(`Failed to open ${label.toLowerCase()}:`, e);
      Alert.alert('Error', `Could not open the ${label}. Please try again.`);
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
      if (purchaserInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]) {
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
      const hasPro = !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];

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

      const message = String(e?.message || '').toLowerCase();
      const code = String(e?.code || '').toLowerCase();

      if (message.includes('network') || code.includes('network')) {
        Alert.alert('Restore Failed', 'Network issue while restoring purchases. Please try again.');
      } else {
        Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
      }
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
      const hasEntitlement = !!customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID];

      if (firestorePremium || hasEntitlement) {
        await setDoc(userRef, { email: user.email ?? '', premium: true }, { merge: true });
        setPremiumStatus('Premium User');
        Alert.alert('Already Premium', 'You already have Joe Hawk Premium.');
        return;
      }

      const offerings = await Purchases.getOfferings();
      const offering = offerings.current;

      if (!offering || offering.availablePackages.length === 0) {
        Alert.alert('Purchase Unavailable', 'RevenueCat does not have a current premium package configured yet.');
        return;
      }

      const purchaseResult = await Purchases.purchasePackage(offering.availablePackages[0]);
      const updatedCustomerInfo = purchaseResult?.customerInfo ?? purchaseResult;
      const nowHasPro = !!updatedCustomerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID];

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
        } else if (message.includes('not available') || message.includes('product') || code.includes('product')) {
          Alert.alert('Purchase Error', 'The premium product is not configured correctly yet in App Store Connect or RevenueCat.');
        } else if (message.includes('network') || code.includes('network')) {
          Alert.alert('Purchase Error', 'Network issue during purchase. Please try again.');
        } else {
          Alert.alert('Purchase Error', 'Purchase failed. If this keeps happening, the RevenueCat entitlement/offering setup is probably incomplete.');
        }
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{userEmail ? userEmail.charAt(0).toUpperCase() : '?'}</Text>
        </View>

        <Text style={styles.emailText}>{userEmail}</Text>
        <View style={premiumStatus === 'Premium User' ? styles.premiumBadge : styles.freeBadge}>
          <Text style={premiumStatus === 'Premium User' ? styles.premiumBadgeText : styles.freeBadgeText}>
            {premiumStatus || 'Loading...'}
          </Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleUpgradeToPremium}>
          <Text style={styles.primaryButtonText}>Upgrade to Premium</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleRestorePurchases}>
          <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout}>
          <Text style={styles.secondaryButtonText}>Log Out</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAccount}>
          <Text style={styles.dangerButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Legal</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => handleOpenLink(PRIVACY_POLICY_URL, 'Privacy Policy')}>
          <Text style={styles.linkButtonText}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => handleOpenLink(TERMS_URL, 'Terms of Service')}>
          <Text style={styles.linkButtonText}>Terms of Service</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => handleOpenLink(GUIDELINES_URL, 'Community Guidelines')}>
          <Text style={styles.linkButtonText}>Community Guidelines</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#F3F0EC',
  },
  profileCard: {
    backgroundColor: '#24160B',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#24160B',
    fontSize: 30,
    fontWeight: 'bold',
  },
  emailText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  premiumBadge: {
    backgroundColor: '#FFD700',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  premiumBadgeText: {
    color: '#24160B',
    fontWeight: 'bold',
  },
  freeBadge: {
    backgroundColor: '#EFEFEF',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  freeBadgeText: {
    color: '#444',
    fontWeight: 'bold',
  },
  sectionCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E1DDD7',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#24160B',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#24160B',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: '#24160B',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FFF1F1',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#C62828',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkButton: {
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  linkButtonText: {
    color: '#24160B',
    fontSize: 16,
    fontWeight: '600',
  },
});