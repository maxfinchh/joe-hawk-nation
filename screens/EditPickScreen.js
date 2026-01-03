import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Switch } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function EditPickScreen({ route, navigation }) {
  const { post } = route.params;

  const [title, setTitle] = useState(post?.title || '');
  const [body, setBody] = useState(post?.body || '');
  const [isPremium, setIsPremium] = useState(post?.isPremium || false);

  const handleUpdate = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a pick title.');
      return;
    }
    if (!post?.id) {
      console.error('No post data found for editing.');
      Alert.alert('Error', 'No post data found.');
      return;
    }
    try {
      const postRef = doc(db, 'picks', post.id);
      await updateDoc(postRef, {
        title,
        body,
        isPremium,
        date: new Date().toISOString() // use 'date' instead of 'timestamp'
      });
      Alert.alert('Success', 'Pick updated!');
      navigation.goBack();
    } catch (error) {
      console.error('Error updating pick:', error);
      Alert.alert('Error', 'Could not update pick.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Edit Pick</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Pick title"
        placeholderTextColor="#aaa"
      />
      <TextInput
        style={[styles.input, styles.bodyInput]}
        value={body}
        onChangeText={setBody}
        placeholder="Pick body"
        placeholderTextColor="#aaa"
        multiline
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Premium:</Text>
        <Switch
          value={isPremium}
          onValueChange={setIsPremium}
        />
      </View>
      <Button title="Update Pick" onPress={handleUpdate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    backgroundColor: '#fff'
  },
  header: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center'
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    color: '#000'
  },
  bodyInput: {
    height: 100,
    textAlignVertical: 'top'
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  switchLabel: {
    fontSize: 16,
    marginRight: 10
  }
});