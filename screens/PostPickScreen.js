import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Switch, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../firebaseConfig';
import { Image, TouchableOpacity } from 'react-native';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';

export default function PostPickScreen({ navigation, route }) {
  const editingPost = route?.params?.post || null;
  const [title, setTitle] = useState(editingPost?.title || '');
  const [body, setBody] = useState(editingPost?.body || '');
  const [isPremium, setIsPremium] = useState(editingPost?.isPremium || false);

  const [mediaUri, setMediaUri] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'image' or 'video'

  const pickMedia = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access media is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type);
    }
  };

  const handlePostPick = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a pick title.');
      return;
    }
    try {
      let mediaUrl = null;
      if (mediaUri) {
        try {
          const response = await fetch(mediaUri);
          const blob = await response.blob();
          const extension = mediaType === 'image' ? 'jpg' : 'mp4';
          const filename = `media_${Date.now()}.${extension}`;
          const uploadRef = ref(storage, `media/${filename}`);
          await uploadBytes(uploadRef, blob);
          mediaUrl = await getDownloadURL(uploadRef);
        } catch (uploadError) {
          console.error('Media upload error:', uploadError);
          Alert.alert('Error', 'Failed to upload media.');
          return;
        }
      }
      if (editingPost) {
        const postRef = doc(db, 'picks', editingPost.id);
        const updateData = {
          title,
          body,
          isPremium,
          date: new Date(), // Update date on edit
        };
        if (mediaUrl) {
          updateData.mediaUrl = mediaUrl;
          updateData.mediaType = mediaType;
        }
        await updateDoc(postRef, updateData);
        Alert.alert('Success', 'Pick updated!');
      } else {
        await addDoc(collection(db, 'picks'), {
          title,
          body,
          isPremium,
          date: new Date(),
          mediaUrl,
          mediaType,
        });
        Alert.alert('Success', 'Pick posted!');
      }
      navigation.navigate('Home');
    } catch (error) {
      console.error('Error posting/updating pick:', error);
      Alert.alert('Error', 'Could not post or update pick.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Post a New Pick</Text>
      <TouchableOpacity onPress={pickMedia} style={styles.input}>
        <Text>{mediaUri ? 'Change Media' : 'Add Image or Video'}</Text>
      </TouchableOpacity>
      {mediaUri && mediaType === 'image' && (
        <Image source={{ uri: mediaUri }} style={{ width: '100%', height: 200, marginBottom: 15 }} />
      )}
      <TextInput
        style={styles.input}
        placeholder="Pick Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Pick Description (optional)"
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={4}
      />
      <View style={styles.switchContainer}>
        <Text style={styles.label}>Premium Pick?</Text>
        <Switch
          value={isPremium}
          onValueChange={setIsPremium}
        />
      </View>
      <View style={styles.buttonWrapper}>
        <Button title="Post Pick" onPress={handlePostPick} color="#FFD700" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'white',
    marginBottom: 15,
    padding: 10,
    borderRadius: 5,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 18,
  },
  buttonWrapper: {
    marginTop: 20,
  },
});