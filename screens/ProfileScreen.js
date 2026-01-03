import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import Purchases from 'react-native-purchases';

export default function ProfileScreen() {
  const auth = getAuth();
  const firestore = getFirestore();
  const navigation = useNavigation();

  const [userEmail, setUserEmail] = useState('');
  const [premiumStatus, setPremiumStatus] = useState(null);

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

    Purchases.configure({
      apiKey: 'appl_mieNuuRVDtnWaueMwwMXREAcLdt',
    });

    const checkRevenueCat = async () => {
      const purchaserInfo = await Purchases.getCustomerInfo();
      if (purchaserInfo.entitlements.active['Joe Hawk Nation Pro']) {
        const user = auth.currentUser;
        if (user) {
          const userRef = doc(firestore, 'users', user.uid);
          await updateDoc(userRef, { premium: true });
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

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Email: {userEmail}</Text>
      <Text style={styles.text}>Status: {premiumStatus}</Text>
      <TouchableOpacity onPress={handleLogout}>
        <Text style={{ color: 'blue', marginTop: 20 }}>Log Out</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={async () => {
          try {
            const offerings = await Purchases.getOfferings();
            const offering = offerings.current;

            if (offering && offering.availablePackages.length > 0) {
              const purchase = await Purchases.purchasePackage(offering.availablePackages[0]);

              const user = auth.currentUser;
              if (user) {
                const userRef = doc(firestore, 'users', user.uid);
                await updateDoc(userRef, { premium: true });
                setPremiumStatus('Premium User');
                alert('Upgraded to Premium!');
              }
            } else {
              alert('No available purchase packages');
            }
          } catch (e) {
            if (!e.userCancelled) {
              console.warn('Purchase failed:', e);
              alert('Something went wrong during purchase');
            }
          }
        }}
      >
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