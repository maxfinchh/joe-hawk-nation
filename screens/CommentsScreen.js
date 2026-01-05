import React, { useEffect, useMemo, useState } from 'react';
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
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function CommentsScreen({ route, navigation }) {
  const { pickId, title } = route.params;

  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const user = auth.currentUser;

  const adminEmails = useMemo(
    () => ['tmaxfinch6@gmail.com', 'joehawkNation@icloud.com'],
    []
  );
  const isAdmin = !!user && adminEmails.includes(user.email);

  useEffect(() => {
    navigation.setOptions({
      title: title ? `Comments • ${title}` : 'Comments',
    });
  }, [navigation, title]);

  useEffect(() => {
    if (!pickId) return;

    const commentsRef = collection(db, 'picks', pickId, 'comments');
    const q = query(commentsRef, orderBy('date', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => {
          const raw = d.data();
          return {
            id: d.id,
            ...raw,
            date: raw.date?.toDate?.() || null,
          };
        });
        setComments(data);
      },
      (err) => console.error('Error loading comments:', err)
    );

    return () => unsub();
  }, [pickId]);

  const handleSend = async () => {
    if (!user) {
      Alert.alert('Login required', 'You must be logged in to comment.');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const commentsRef = collection(db, 'picks', pickId, 'comments');
      await addDoc(commentsRef, {
        text: trimmed,
        date: serverTimestamp(),
        authorId: user.uid,
        authorLabel: isAdmin ? 'Joe Hawk' : 'Anonymous',
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
                <Text style={styles.author}>{item.authorLabel || 'Anonymous'}</Text>
                <Text style={styles.dateText}>
                  {item.date ? item.date.toLocaleString() : ''}
                </Text>
              </View>

              <Text style={styles.commentText}>{item.text}</Text>

              {canDelete(item) && (
                <TouchableOpacity
                  onPress={() => handleDelete(item.id)}
                  style={styles.deleteBtn}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
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
    marginBottom: 6,
  },
  author: { fontWeight: 'bold', fontSize: 14 },
  dateText: { fontSize: 12, color: 'gray' },
  commentText: { fontSize: 15, color: '#333' },
  deleteBtn: { marginTop: 8, alignSelf: 'flex-end' },
  deleteText: { color: 'red', fontSize: 13 },

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