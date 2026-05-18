import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';
import * as ImagePicker from 'expo-image-picker';

export default function CommentsScreen({ route, navigation }) {
  const { pickId, title } = route.params;

  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [likedCommentMap, setLikedCommentMap] = useState({});
  const [commentLikeCountMap, setCommentLikeCountMap] = useState({});
  const [selectedMedia, setSelectedMedia] = useState(null);
  const handlePickMedia = async () => {
    if (sending) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to add an image or GIF.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setSelectedMedia({
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        fileName: asset.fileName || `comment-${Date.now()}.jpg`,
      });
    } catch (err) {
      console.error('Error picking comment media:', err);
      Alert.alert('Error', 'Could not select that image. Please try again.');
    }
  };

  const user = auth.currentUser;
  const [isAdmin, setIsAdmin] = useState(false);
  const [isJoeHawk, setIsJoeHawk] = useState(false);

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

  const getDisplayAuthor = (comment, index) => {
    if (comment.authorLabel && comment.authorLabel !== 'Anonymous') {
      return comment.authorLabel;
    }

    return `#${index + 1}`;
  };

  const getCommentNumberById = (commentId) => {
    const commentIndex = comments.findIndex((comment) => comment.id === commentId);
    return commentIndex >= 0 ? `#${commentIndex + 1}` : null;
  };

  const getReplyTargetLabel = (comment) => {
    if (!comment?.replyToCommentId) return null;

    return getCommentNumberById(comment.replyToCommentId) || comment.replyToLabel || null;
  };

  const loadCommentLikes = async (commentList) => {
    try {
      if (!Array.isArray(commentList) || commentList.length === 0) {
        setLikedCommentMap({});
        setCommentLikeCountMap({});
        return;
      }

      const countPairs = await Promise.all(
        commentList.map(async (comment) => {
          const likesRef = collection(db, 'picks', pickId, 'comments', comment.id, 'likes');
          const likesSnap = await getDocs(likesRef);

          let likedByCurrentUser = false;
          if (user) {
            const likeRef = doc(db, 'picks', pickId, 'comments', comment.id, 'likes', user.uid);
            const likeSnap = await getDoc(likeRef);
            likedByCurrentUser = likeSnap.exists();
          }

          return [comment.id, likesSnap.size, likedByCurrentUser];
        })
      );

      const nextLikeCounts = {};
      const nextLikedMap = {};

      for (const [commentId, likeCount, likedByCurrentUser] of countPairs) {
        nextLikeCounts[commentId] = likeCount;
        nextLikedMap[commentId] = likedByCurrentUser;
      }

      setCommentLikeCountMap(nextLikeCounts);
      setLikedCommentMap(nextLikedMap);
    } catch (err) {
      console.error('Error loading comment likes:', err);
    }
  };

  const BANNED_WORDS = [
    'nigger',
    'faggot',
    'kike',
    'spic',
    'chink',
    'retard',
    'tranny',
  ];

  const containsBlockedWord = (value) => {
    const lower = value.toLowerCase();
    return BANNED_WORDS.some((word) => lower.includes(word));
  };

  const looksLikeSpam = (value) => {
    const lower = value.toLowerCase();
    const urlMatches = lower.match(/https?:\/\//g) || [];
    const wwwMatches = lower.match(/www\./g) || [];
    const repeatedChar = /(.)\1{7,}/.test(lower);

    return urlMatches.length + wwwMatches.length >= 2 || repeatedChar;
  };

  useEffect(() => {
    navigation.setOptions({
      title: title ? `Comments • ${title}` : 'Comments',
    });
  }, [navigation, title]);

  useEffect(() => {
    const loadUserStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsJoeHawk(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        setIsAdmin(userData?.isAdmin === true);
        setIsJoeHawk(userData?.isJoeHawk === true);
      } catch (err) {
        console.error('Error loading comment screen admin status:', err);
        setIsAdmin(false);
        setIsJoeHawk(false);
      }
    };

    loadUserStatus();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setBlockedUserIds([]);
      return;
    }

    const blockedRef = collection(db, 'users', user.uid, 'blockedUsers');
    const unsub = onSnapshot(
      blockedRef,
      (snap) => {
        setBlockedUserIds(snap.docs.map((d) => d.id));
      },
      (err) => console.error('Error loading blocked users:', err)
    );

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!pickId) return;

    const commentsRef = collection(db, 'picks', pickId, 'comments');
    const q = query(commentsRef, orderBy('date', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs
          .map((d) => {
            const raw = d.data();
            return {
              id: d.id,
              ...raw,
              date: raw.date?.toDate?.() || null,
            };
          })
          .filter((comment) => !blockedUserIds.includes(comment.authorId));
        setComments(data);
        loadCommentLikes(data);
      },
      (err) => console.error('Error loading comments:', err)
    );

    return () => unsub();
  }, [pickId, blockedUserIds]);

  const handleSend = async () => {
    if (!user) {
      Alert.alert('Login required', 'You must be logged in to comment.');
      return;
    }
    const trimmed = text.trim();

    if (!trimmed && !selectedMedia) return;

    if (containsBlockedWord(trimmed)) {
      Alert.alert(
        'Comment blocked',
        'Your comment contains language that is not allowed in Joe Hawk Nation.'
      );
      return;
    }

    if (looksLikeSpam(trimmed)) {
      Alert.alert(
        'Comment blocked',
        'Your comment looks like spam or abusive posting. Please edit it and try again.'
      );
      return;
    }

    setSending(true);
    try {
      let mediaUrl = null;
      let mediaType = null;
      let mediaPath = null;

      if (selectedMedia) {
        const response = await fetch(selectedMedia.uri);
        const blob = await response.blob();
        const extension = selectedMedia.fileName.split('.').pop() || 'jpg';
        mediaPath = `commentMedia/${pickId}/${user.uid}-${Date.now()}.${extension}`;
        const mediaRef = ref(storage, mediaPath);

        await uploadBytes(mediaRef, blob, {
          contentType: selectedMedia.type,
        });
        mediaUrl = await getDownloadURL(mediaRef);
        mediaType = selectedMedia.type;
      }

      const commentsRef = collection(db, 'picks', pickId, 'comments');
      await addDoc(commentsRef, {
        text: trimmed,
        mediaUrl,
        mediaType,
        mediaPath,
        date: serverTimestamp(),
        authorId: user.uid,
        authorLabel: isJoeHawk ? 'Joe Hawk' : isAdmin ? 'Admin' : 'Anonymous',
        replyToCommentId: replyTo?.id || null,
        replyToLabel: replyTo?.label || null,
      });
      setText('');
      setSelectedMedia(null);
      setReplyTo(null);
    } catch (err) {
      console.error('Error creating comment:', err);
      Alert.alert('Error', 'Could not post comment.');
    } finally {
      setSending(false);
    }
  };

  const canDelete = (comment) => {
    if (!user) return false;
    return isAdmin || comment.authorId === user.uid;
  };

  const handleDelete = async (commentId) => {
    if (!user) return;

    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'picks', pickId, 'comments', commentId));
          } catch (err) {
            console.error('Error deleting comment:', err);
            Alert.alert('Error', 'Could not delete comment.');
          }
        },
      },
    ]);
  };

  const handleReply = (comment) => {
    const commentIndex = comments.findIndex((item) => item.id === comment.id);
    const label = getDisplayAuthor(comment, commentIndex >= 0 ? commentIndex : 0);
    setReplyTo({
      id: comment.id,
      label,
    });
  };

  const handleToggleCommentLike = async (comment) => {
    if (!user) {
      Alert.alert('Login required', 'You must be logged in to like comments.');
      return;
    }

    const commentId = comment.id;
    const currentlyLiked = !!likedCommentMap[commentId];

    setLikedCommentMap((prev) => ({ ...prev, [commentId]: !currentlyLiked }));
    setCommentLikeCountMap((prev) => ({
      ...prev,
      [commentId]: Math.max((prev[commentId] || 0) + (currentlyLiked ? -1 : 1), 0),
    }));

    const likeRef = doc(db, 'picks', pickId, 'comments', commentId, 'likes', user.uid);

    try {
      if (currentlyLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          userId: user.uid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      setLikedCommentMap((prev) => ({ ...prev, [commentId]: currentlyLiked }));
      setCommentLikeCountMap((prev) => ({
        ...prev,
        [commentId]: Math.max((prev[commentId] || 0) + (currentlyLiked ? 1 : -1), 0),
      }));
      console.error('Error toggling comment like:', err);
      Alert.alert('Error', 'Could not update comment like. Please try again.');
    }
  };

  const handleReport = async (comment) => {
    if (!user) {
      Alert.alert('Login required', 'You must be logged in to report comments.');
      return;
    }

    Alert.alert('Report comment', 'Why are you reporting this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Spam',
        onPress: async () => {
          try {
            await addDoc(collection(db, 'reports'), {
              type: 'comment',
              pickId,
              commentId: comment.id,
              reporterId: user.uid,
              authorId: comment.authorId || null,
              reason: 'Spam',
              text: comment.text || '',
              createdAt: serverTimestamp(),
            });
            Alert.alert('Reported', 'Thanks. We will review this comment.');
          } catch (err) {
            console.error('Error reporting comment:', err);
            Alert.alert('Error', 'Could not report comment.');
          }
        },
      },
      {
        text: 'Harassment',
        onPress: async () => {
          try {
            await addDoc(collection(db, 'reports'), {
              type: 'comment',
              pickId,
              commentId: comment.id,
              reporterId: user.uid,
              authorId: comment.authorId || null,
              reason: 'Harassment',
              text: comment.text || '',
              createdAt: serverTimestamp(),
            });
            Alert.alert('Reported', 'Thanks. We will review this comment.');
          } catch (err) {
            console.error('Error reporting comment:', err);
            Alert.alert('Error', 'Could not report comment.');
          }
        },
      },
      {
        text: 'Abusive content',
        onPress: async () => {
          try {
            await addDoc(collection(db, 'reports'), {
              type: 'comment',
              pickId,
              commentId: comment.id,
              reporterId: user.uid,
              authorId: comment.authorId || null,
              reason: 'Abusive content',
              text: comment.text || '',
              createdAt: serverTimestamp(),
            });
            Alert.alert('Reported', 'Thanks. We will review this comment.');
          } catch (err) {
            console.error('Error reporting comment:', err);
            Alert.alert('Error', 'Could not report comment.');
          }
        },
      },
    ]);
  };

  const handleBlockUser = async (comment) => {
    if (!user) {
      Alert.alert('Login required', 'You must be logged in to block users.');
      return;
    }

    if (!comment.authorId || comment.authorId === user.uid) {
      return;
    }

    Alert.alert('Block user?', 'You will stop seeing comments from this user.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await setDoc(doc(db, 'users', user.uid, 'blockedUsers', comment.authorId), {
              blockedAt: serverTimestamp(),
            });
            Alert.alert('User blocked', 'Comments from this user will be hidden.');
          } catch (err) {
            console.error('Error blocking user:', err);
            Alert.alert('Error', 'Could not block user.');
          }
        },
      },
    ]);
  };

  const handleCommentMenu = useCallback(
    (comment) => {
      const actions = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reply', onPress: () => handleReply(comment) },
        { text: 'Report', onPress: () => handleReport(comment) },
      ];

      if (user && comment.authorId && comment.authorId !== user.uid) {
        actions.splice(2, 0, {
          text: 'Block User',
          style: 'destructive',
          onPress: () => handleBlockUser(comment),
        });
      }

      if (canDelete(comment)) {
        actions.splice(actions.length - 1, 0, {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(comment.id),
        });
      }

      Alert.alert('Comment options', 'Choose an action', actions);
    },
    [user, pickId, isAdmin, comments, likedCommentMap]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 110 : 0}
    >
      <View style={styles.inner}>
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 12 }}
          renderItem={({ item, index }) => (
            <View style={[styles.commentCard, item.replyToCommentId ? styles.replyCommentCard : null]}>
              <View style={styles.commentHeader}>
                <View style={styles.commentHeaderLeft}>
                  <Text style={styles.author}>{getDisplayAuthor(item, index)}</Text>
                  {getReplyTargetLabel(item) ? (
                    <Text style={styles.replyInline}>› {getReplyTargetLabel(item)}</Text>
                  ) : null}
                  <Text style={styles.dateText}>{getRelativeTime(item.date)}</Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleCommentMenu(item)}
                  style={styles.menuBtn}
                >
                  <Text style={styles.menuText}>•••</Text>
                </TouchableOpacity>
              </View>

              {item.text ? <Text style={styles.commentText}>{item.text}</Text> : null}

              {item.mediaUrl ? (
                <Image
                  source={{ uri: item.mediaUrl }}
                  style={styles.commentMedia}
                  resizeMode="cover"
                />
              ) : null}

              <View style={styles.commentActionRow}>
                <TouchableOpacity onPress={() => handleReply(item)}>
                  <Text style={styles.inlineReplyText}>Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.commentLikeButton}
                  onPress={() => handleToggleCommentLike(item)}
                >
                  <Text style={styles.commentLikeText}>
                    👍 {commentLikeCountMap[item.id] || 0}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No comments yet. Be the first one in.
            </Text>
          }
        />

        {replyTo ? (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerText}>Replying to {replyTo.label}</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Text style={styles.replyCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {selectedMedia ? (
          <View style={styles.mediaPreviewWrap}>
            <Image source={{ uri: selectedMedia.uri }} style={styles.mediaPreview} />
            <TouchableOpacity
              onPress={() => setSelectedMedia(null)}
              style={styles.removeMediaBtn}
              disabled={sending}
            >
              <Text style={styles.removeMediaText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.inputBar}>
          <TouchableOpacity
            onPress={handlePickMedia}
            style={styles.attachBtn}
            disabled={sending}
          >
            <Text style={styles.attachText}>＋</Text>
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={replyTo ? `Reply to ${replyTo.label}...` : 'Write a comment...'}
            placeholderTextColor="#888"
            style={styles.input}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={[styles.sendBtn, sending ? { opacity: 0.6 } : null]}
            disabled={sending}
          >
            {sending ? <ActivityIndicator size="small" color="#24160B" /> : <Text style={styles.sendText}>Send</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F0EC',
  },
  inner: {
    flex: 1,
    padding: 12,
  },

  commentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2DDD7',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  replyCommentCard: {
    marginLeft: 34,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  commentHeaderLeft: {
    flex: 1,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  author: {
    fontWeight: '900',
    fontSize: 16,
    color: '#111',
  },
  replyInline: {
    color: '#777',
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 7,
  },
  dateText: {
    fontSize: 13,
    color: '#777',
    marginLeft: 8,
    fontWeight: '600',
  },
  menuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  menuText: {
    fontSize: 19,
    color: '#555',
    fontWeight: '900',
  },
  commentText: {
    fontSize: 16,
    color: '#222',
    lineHeight: 22,
  },
  commentMedia: {
    width: '100%',
    height: 230,
    borderRadius: 14,
    marginTop: 10,
    backgroundColor: '#E2DDD7',
  },
  mediaPreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2DDD7',
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
  },
  mediaPreview: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: '#E2DDD7',
  },
  removeMediaBtn: {
    marginLeft: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F1EFEC',
  },
  removeMediaText: {
    color: '#C62828',
    fontWeight: '900',
    fontSize: 13,
  },
  commentActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  inlineReplyText: {
    color: '#777',
    fontSize: 14,
    fontWeight: '900',
  },
  commentLikeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F1EFEC',
    borderRadius: 999,
  },
  commentLikeText: {
    color: '#24160B',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    color: '#777',
    fontSize: 15,
    fontWeight: '600',
  },

  replyBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF4B8',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EAD56A',
  },
  replyBannerText: {
    color: '#24160B',
    fontWeight: '800',
    fontSize: 14,
  },
  replyCancelText: {
    color: '#C62828',
    fontWeight: '900',
    fontSize: 14,
  },

  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1EFEC',
    marginRight: 8,
  },
  attachText: {
    color: '#24160B',
    fontWeight: '900',
    fontSize: 24,
    lineHeight: 26,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2DDD7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 7,
    paddingRight: 10,
    color: '#111',
  },
  sendBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFD700',
    borderRadius: 999,
  },
  sendText: {
    fontWeight: '900',
    color: '#24160B',
  },
});