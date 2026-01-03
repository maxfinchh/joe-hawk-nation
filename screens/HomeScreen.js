import React, { useEffect, useState, useLayoutEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Video } from 'expo-av';
import { doc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const [picks, setPicks] = useState([]);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const user = auth.currentUser;
  const adminEmails = ['tmaxfinch6@gmail.com', 'joehawkNation@icloud.com'];
  const isAdmin = user && adminEmails.includes(user.email);

  const handleEdit = (post) => {
    const serializedPost = {
      ...post,
      date: post.date?.toISOString?.() || null
    };
    navigation.navigate('EditPickScreen', { post: serializedPost });
  };

  const handleDelete = async (postId) => {
    try {
      await deleteDoc(doc(db, 'picks', postId));
      setPicks((prevPicks) => prevPicks.filter((pick) => pick.id !== postId));
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => {
    const checkPremiumStatusAndFetchPicks = async () => {
      if (auth.currentUser) {
        try {
          const docRef = doc(db, 'users', auth.currentUser.uid);
          const userDoc = await getDoc(docRef);
          if (userDoc.exists()) {
            const isPremium = userDoc.data().premium === true;
            console.log("Fetched premium status:", isPremium);
            setIsPremiumUser(isPremium);
          } else {
            console.log("User doc not found");
          }
        } catch (error) {
          console.error('Error fetching premium status:', error);
        }
      }

      try {
        const snapshot = await getDocs(collection(db, 'picks'));
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date ? doc.data().date.toDate?.() || new Date(doc.data().date) : null,
          }))
          .sort((a, b) => (b.date && a.date ? b.date - a.date : 0));
        setPicks(data);
      } catch (error) {
        console.error('Error loading picks:', error);
      }
    };

    checkPremiumStatusAndFetchPicks();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const fetchPicks = async () => {
        try {
          const snapshot = await getDocs(collection(db, 'picks'));
          const data = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              date: doc.data().date ? doc.data().date.toDate?.() || new Date(doc.data().date) : null,
            }))
            .sort((a, b) => (b.date && a.date ? b.date - a.date : 0));
          setPicks(data);
        } catch (error) {
          console.error('Error loading picks:', error);
        }
      };

      fetchPicks();
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ marginLeft: 15 }}>
          <Ionicons name="person-circle-outline" size={28} color="white" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout}>
          <Text style={{ color: 'white', marginRight: 10, fontSize: 16 }}>
            Logout
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Joe's Picks</Text>
      <FlatList
        data={picks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.pickCard}>
            <Text style={item.isPremium ? styles.premiumPick : styles.pickTitle}>
              {item.isPremium && !isPremiumUser ? '🔒 Premium Pick - Upgrade to View' : item.title}
            </Text>
            {item.body && (!item.isPremium || isPremiumUser) ? (
              <Text style={styles.pickBody}>{item.body}</Text>
            ) : null}
            {!item.isPremium || isPremiumUser ? (
              item.mediaType === 'video' && item.mediaUrl ? (
                <Video
                  source={{ uri: item.mediaUrl }}
                  style={{ width: '100%', height: 200, borderRadius: 10, marginBottom: 8 }}
                  resizeMode="cover"
                  useNativeControls
                />
              ) : (item.mediaType === 'image' || !item.mediaType) && item.mediaUrl ? (
                <View style={{ width: '100%', height: 200, borderRadius: 10, marginBottom: 8, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }}>
                  <Image
                    source={{ uri: item.mediaUrl }}
                    style={{ width: '100%', height: 200, borderRadius: 10 }}
                    resizeMode="cover"
                    onError={(e) => {
                      console.warn('Image load error:', e.nativeEvent.error);
                    }}
                  />
                </View>
              ) : null
            ) : null}
            <View style={styles.pickFooter}>
              <Text style={styles.pickDate}>
                {item.date ? new Date(item.date).toLocaleDateString() : ''}
              </Text>
              <TouchableOpacity style={styles.likeButton}>
                <Text style={styles.likeButtonText}>👍 Like</Text>
              </TouchableOpacity>
            </View>
            {isAdmin && (
              <View style={{ flexDirection: 'row', marginTop: 5 }}>
                <TouchableOpacity onPress={() => handleEdit(item)}>
                  <Text style={{ color: 'blue', marginRight: 10 }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Text style={{ color: 'red' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
      {isAdmin && (
        <View style={{ marginBottom: 30 }}>
          <TouchableOpacity style={styles.postButton} onPress={() => navigation.navigate('PostPick')}>
            <Text style={styles.postButtonText}>Post a Pick</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 15,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  pickCard: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pickTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  premiumPick: {
    fontSize: 18,
    marginBottom: 10,
    color: 'gold',
    fontWeight: 'bold',
  },
  pickBody: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  pickDate: {
    fontSize: 12,
    color: 'gray',
    textAlign: 'right',
  },
  postButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 40,
  },
  postButtonText: {
    color: 'black',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pickFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  likeButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
  },
  likeButtonText: {
    fontSize: 14,
    color: '#333',
  },
});