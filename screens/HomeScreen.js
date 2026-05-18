import React, { useEffect, useState, useLayoutEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Alert, RefreshControl } from 'react-native';
import { Video } from 'expo-av';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }) {
  const [picks, setPicks] = useState([]);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [likedMap, setLikedMap] = useState({}); // { [pickId]: true/false }
  const [likeCountMap, setLikeCountMap] = useState({}); // { [pickId]: number }
  const [commentCountMap, setCommentCountMap] = useState({}); // { [pickId]: number }
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [playingVideoMap, setPlayingVideoMap] = useState({});

  const user = auth.currentUser;

  const getRelativeTime = (dateValue) => {
    if (!dateValue) return '';

    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const diffMs = Date.now() - date.getTime();
    const diffSeconds = Math.max(Math.floor(diffMs / 1000), 0);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);

    if (diffSeconds < 60) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return `${diffWeeks}w`;
  };

  const handleEdit = (post) => {
    const serializedPost = {
      ...post,
      date: post.date?.toISOString?.() || null,
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

  const refreshUserStatus = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsPremiumUser(false);
      setIsAdmin(false);
      return { isPremium: false, isAdmin: false };
    }

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setIsPremiumUser(false);
        setIsAdmin(false);
        return { isPremium: false, isAdmin: false };
      }

      const data = userSnap.data();
      const isPremium = data?.premium === true;
      const admin = data?.isAdmin === true;

      setIsPremiumUser(isPremium);
      setIsAdmin(admin);

      return { isPremium, isAdmin: admin };
    } catch (error) {
      console.error('Error refreshing user status:', error);
      setIsPremiumUser(false);
      setIsAdmin(false);
      return { isPremium: false, isAdmin: false };
    }
  };

  const loadLikesForPicks = async (picksList) => {
    try {
      const u = auth.currentUser;
      if (!u || !Array.isArray(picksList) || picksList.length === 0) {
        setLikedMap({});
        return;
      }

      const pairs = await Promise.all(
        picksList.map(async (p) => {
          const likeRef = doc(db, 'picks', p.id, 'likes', u.uid);
          const likeSnap = await getDoc(likeRef);
          return [p.id, likeSnap.exists()];
        })
      );

      const next = {};
      for (const [pickId, liked] of pairs) {
        next[pickId] = liked;
      }
      setLikedMap(next);
    } catch (e) {
      console.warn('Error loading likes:', e);
    }
  };

  const loadCountsForPicks = async (picksList) => {
    try {
      if (!Array.isArray(picksList) || picksList.length === 0) {
        setLikeCountMap({});
        setCommentCountMap({});
        return;
      }

      const countPairs = await Promise.all(
        picksList.map(async (p) => {
          const likesSnap = await getDocs(collection(db, 'picks', p.id, 'likes'));
          const commentsSnap = await getDocs(collection(db, 'picks', p.id, 'comments'));

          return [p.id, likesSnap.size, commentsSnap.size];
        })
      );

      const nextLikeCounts = {};
      const nextCommentCounts = {};

      for (const [pickId, likeCount, commentCount] of countPairs) {
        nextLikeCounts[pickId] = likeCount;
        nextCommentCounts[pickId] = commentCount;
      }

      setLikeCountMap(nextLikeCounts);
      setCommentCountMap(nextCommentCounts);
    } catch (e) {
      console.warn('Error loading post counts:', e);
    }
  };

  const fetchPosts = async () => {
    await refreshUserStatus();

    try {
      const snapshot = await getDocs(collection(db, 'picks'));
      const data = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          date: d.data().date ? d.data().date.toDate?.() || new Date(d.data().date) : null,
        }))
        .sort((a, b) => (b.date && a.date ? b.date - a.date : 0));

      setPicks(data);
      await loadLikesForPicks(data);
      await loadCountsForPicks(data);
    } catch (error) {
      console.error('Error loading posts:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  const handleToggleLike = async (pick) => {
    const u = auth.currentUser;
    if (!u) {
      Alert.alert('Sign in required', 'Please sign in to like picks.');
      return;
    }

    if (pick?.isPremium && !isPremiumUser) {
      Alert.alert('Premium Post', 'Upgrade to premium to like this post.');
      return;
    }

    const pickId = pick.id;
    const currentlyLiked = !!likedMap[pickId];

    // Optimistic UI
    setLikedMap((prev) => ({ ...prev, [pickId]: !currentlyLiked }));
    setLikeCountMap((prev) => ({
      ...prev,
      [pickId]: Math.max((prev[pickId] || 0) + (currentlyLiked ? -1 : 1), 0),
    }));

    const likeRef = doc(db, 'picks', pickId, 'likes', u.uid);

    try {
      if (currentlyLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          userId: u.uid,
          createdAt: new Date(),
        });
      }
    } catch (e) {
      // Roll back UI if the write failed
      setLikedMap((prev) => ({ ...prev, [pickId]: currentlyLiked }));
      setLikeCountMap((prev) => ({
        ...prev,
        [pickId]: Math.max((prev[pickId] || 0) + (currentlyLiked ? 1 : -1), 0),
      }));
      console.warn('Error toggling like:', e);
      Alert.alert('Error', 'Could not update like. Please try again.');
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginLeft: 6 }}
        >
          <Ionicons name="person-circle-outline" size={30} color="white" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout}>
          <Text style={{ color: 'white', marginRight: 9, fontSize: 16 }}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const isVideoPost = (item) => {
    return item?.mediaType === 'video' || item?.mediaType?.startsWith?.('video');
  };

  const handleVideoStatus = async (pickId, status, videoRef) => {
    if (!status?.isLoaded) return;

    setPlayingVideoMap((prev) => ({
      ...prev,
      [pickId]: status.isPlaying,
    }));

    if (status.didJustFinish) {
      setPlayingVideoMap((prev) => ({
        ...prev,
        [pickId]: false,
      }));

      if (videoRef?.current) {
        try {
          await videoRef.current.setPositionAsync(0);
        } catch (error) {
          console.warn('Error resetting video:', error);
        }
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Posts</Text>
      <Text style={styles.subtitle}>Latest from Hawk Nation</Text>
      <FlatList
        data={picks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: isAdmin ? 90 : 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const videoRef = React.createRef();

          return (
          <View style={styles.pickCard}>
            <View style={styles.postMetaRow}>
              <View style={styles.hawkBadge}>
                <Text style={styles.hawkBadgeText}>HN</Text>
              </View>
              <Text style={styles.postSource}>Hawk Nation</Text>
              <Text style={styles.postDot}>•</Text>
              <Text style={styles.postTimeTop}>{getRelativeTime(item.date)}</Text>
              {item.isPremium ? (
                <View style={styles.premiumTag}>
                  <Text style={styles.premiumTagText}>Premium</Text>
                </View>
              ) : null}
            </View>
            <Text style={item.isPremium ? styles.premiumPick : styles.pickTitle}>
              {item.isPremium && !isPremiumUser ? '🔒 Premium Post - Upgrade to View' : item.title}
            </Text>
            {item.body && (!item.isPremium || isPremiumUser) ? (
              <Text style={styles.pickBody}>{item.body}</Text>
            ) : null}
            {!item.isPremium || isPremiumUser ? (
              item.mediaUrl ? (
                isVideoPost(item) ? (
                  <View style={styles.postMediaWrap}>
                    <Video
                      ref={videoRef}
                      source={{ uri: item.mediaUrl }}
                      style={styles.postMedia}
                      resizeMode="cover"
                      useNativeControls
                      onPlaybackStatusUpdate={(status) => handleVideoStatus(item.id, status, videoRef)}
                    />
                    {!playingVideoMap[item.id] ? (
                      <View pointerEvents="none" style={styles.videoPlayBadge}>
                        <Text style={styles.videoPlayIcon}>▶</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.imageMediaWrap}>
                    <Image
                      source={{ uri: item.mediaUrl }}
                      style={styles.imageMedia}
                      resizeMode="contain"
                      onError={(e) => {
                        console.warn('Image load error:', e.nativeEvent.error);
                      }}
                    />
                  </View>
                )
              ) : null
            ) : null}
            <View style={styles.pickFooter}>
              <View />

              <View style={styles.footerButtons}>
                <TouchableOpacity style={styles.likeButton} onPress={() => handleToggleLike(item)}>
                  <Text style={styles.likeButtonText}>
                    👍 {likeCountMap[item.id] || 0}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.commentsButton}
                  onPress={() => {
                    if (item.isPremium && !isPremiumUser) {
                      Alert.alert('Premium Post', 'Upgrade to premium to view and comment on this post.');
                      return;
                    }
                    navigation.navigate('Comments', {
                      pickId: item.id,
                      title: item.title,
                    });
                  }}
                >
                  <Text style={styles.commentsButtonText}>💬 {commentCountMap[item.id] || 0}</Text>
                </TouchableOpacity>
              </View>
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
          );
        }}
      />
      {isAdmin && (
        <View style={styles.postButtonWrapper}>
          <TouchableOpacity style={styles.postButton} onPress={() => navigation.navigate('PostPick')}>
            <Text style={styles.postButtonText}>＋ Post</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    backgroundColor: '#F3F0EC',
  },
  title: {
    fontSize: 30,
    marginBottom: 2,
    fontWeight: '900',
    textAlign: 'center',
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '600',
  },
  pickCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2DDD7',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  postMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  hawkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#24160B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  hawkBadgeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '900',
  },
  postSource: {
    color: '#24160B',
    fontSize: 14,
    fontWeight: '800',
  },
  postDot: {
    color: '#999',
    marginHorizontal: 6,
    fontSize: 14,
    fontWeight: 'bold',
  },
  postTimeTop: {
    color: '#777',
    fontSize: 13,
    fontWeight: '600',
  },
  premiumTag: {
    marginLeft: 'auto',
    backgroundColor: '#FFF4B8',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  premiumTagText: {
    color: '#7A5B00',
    fontSize: 11,
    fontWeight: '900',
  },
  pickTitle: {
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 8,
    color: '#111',
    lineHeight: 27,
  },
  premiumPick: {
    fontSize: 21,
    marginBottom: 10,
    color: '#D8A900',
    fontWeight: '900',
    lineHeight: 27,
  },
  pickBody: {
    fontSize: 16,
    color: '#333',
    marginBottom: 10,
    lineHeight: 22,
  },
  postMediaWrap: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 520,
    borderRadius: 18,
    marginBottom: 8,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  postMedia: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  imageMediaWrap: {
    width: '100%',
    minHeight: 260,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageMedia: {
    width: '100%',
    height: 320,
    borderRadius: 10,
  },
  videoPlayBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 64,
    height: 64,
    marginLeft: -32,
    marginTop: -32,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayIcon: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    marginLeft: 4,
  },
  pickDate: {
    fontSize: 12,
    color: 'gray',
    textAlign: 'right',
  },
  pickFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  commentsButton: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    backgroundColor: '#F1EFEC',
    borderRadius: 999,
  },
  commentsButtonText: {
    fontSize: 15,
    color: '#24160B',
    fontWeight: '700',
  },
  likeButton: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    backgroundColor: '#F1EFEC',
    borderRadius: 999,
  },
  likeButtonText: {
    fontSize: 15,
    color: '#24160B',
    fontWeight: '700',
  },
  postButtonWrapper: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  postButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  postButtonText: {
    color: '#24160B',
    fontSize: 17,
    fontWeight: 'bold',
  },
});