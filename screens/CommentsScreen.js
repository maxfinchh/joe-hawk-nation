import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function CommentsScreen({ route, navigation }) {
  const { pickId, title } = route.params;

  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState([]);

  const user = auth.currentUser;

  const adminEmails = useMemo(
    () => ['tmaxfinch6@gmail.com', 'joehawkNation@icloud.com'],
    []
  );
  const isAdmin = !!user && adminEmails.includes(user.email);

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
    const lotsOfCaps = value.length >= 12 && value === value.toUpperCase() && /[A-Z]/.test(value);

    return urlMatches.length + wwwMatches.length >= 2 || repeatedChar || lotsOfCaps;
  };

  useEffect(() => {
    navigation.setOptions({
      title: title ? `Comments • ${title}` : 'Comments',
    });
  }, [navigation, title]);

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

    if (!trimmed) return;

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
      const commentsRef = collection(db, 'picks', pickId, 'comments');
      await addDoc(commentsRef, {
        text: trimmed,
        date: serverTimestamp(),
        authorId: user.uid,
        authorLabel: isAdmin ? 'Admin' : 'Anonymous',
      });
      setText('');
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
        { text: 'Report', onPress: () => handleReport(comment) },
      ];

      if (user && comment.authorId && comment.authorId !== user.uid) {
        actions.splice(1, 0, {
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
    [user, pickId]
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
          renderItem={({ item }) => (
            <View style={styles.commentCard}>
              <View style={styles.commentHeader}>
                <View style={styles.commentHeaderLeft}>
                  <Text style={styles.author}>{item.authorLabel || 'Anonymous'}</Text>
                  <Text style={styles.dateText}>
                    {item.date ? item.date.toLocaleString() : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleCommentMenu(item)}
                  style={styles.menuBtn}
                >
                  <Text style={styles.menuText}>•••</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.commentText}>{item.text}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 20, color: 'gray' }}>
              No comments yet.
            </Text>
          }
        />

        <View style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a comment..."
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
            <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 12 },

  commentCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
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
  },
  author: { fontWeight: 'bold', fontSize: 14 },
  dateText: { fontSize: 12, color: 'gray' },
  menuBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  menuText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  commentText: { fontSize: 15, color: '#333' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 6, paddingRight: 10 },
  sendBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFD700',
    borderRadius: 8,
  },
  sendText: { fontWeight: 'bold' },
});