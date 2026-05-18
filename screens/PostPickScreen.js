import React, { useLayoutEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Switch, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
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
  const [isPosting, setIsPosting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editingPost ? 'Edit Post' : 'Post',
    });
  }, [navigation, editingPost]);

  const pickMedia = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access media is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets.length > 0) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type);
    }
  };

  const handlePostPick = async () => {
    if (isPosting) return;

    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a post title.');
      return;
    }

    setIsPosting(true);

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
          setIsPosting(false);
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
        Alert.alert('Success', 'Post updated!');
      } else {
        await addDoc(collection(db, 'picks'), {
          title,
          body,
          isPremium,
          date: new Date(),
          mediaUrl,
          mediaType,
        });
        Alert.alert('Success', 'Posted!');
      }
      navigation.navigate('Home');
    } catch (error) {
      console.error('Error posting/updating:', error);
      Alert.alert('Error', 'Could not post or update.');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 110 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>New Post</Text>

        <TouchableOpacity onPress={pickMedia} style={styles.mediaPickerButton} disabled={isPosting}>
          <Text>{mediaUri ? 'Change Media' : 'Add Image or Video'}</Text>
        </TouchableOpacity>

        {mediaUri && mediaType === 'image' && (
          <Image
            source={{ uri: mediaUri }}
            style={{ width: '100%', height: 320, marginBottom: 15, borderRadius: 8 }}
            resizeMode="contain"
          />
        )}

        {mediaUri && mediaType === 'video' && (
          <View style={styles.videoPreviewWrap}>
            <Video
              source={{ uri: mediaUri }}
              style={styles.videoPreview}
              resizeMode="cover"
              useNativeControls
              shouldPlay={false}
            />
            <View pointerEvents="none" style={styles.videoPlayBadge}>
              <Text style={styles.videoPlayIcon}>▶</Text>
            </View>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Post Title"
          value={title}
          onChangeText={setTitle}
          returnKeyType="next"
        />

        <TextInput
          style={styles.input}
          placeholder="Post Description (optional)"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
        />

        <View style={styles.switchContainer}>
          <Text style={styles.label}>Premium Post?</Text>
          <Switch value={isPremium} onValueChange={setIsPremium} />
        </View>

        <View style={styles.buttonWrapper}>
          {isPosting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#24160B" />
              <Text style={styles.loadingText}>{editingPost ? 'Updating post...' : 'Posting...'}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.submitButton} onPress={handlePostPick}>
              <Text style={styles.submitButtonText}>{editingPost ? 'Update Post' : 'Post'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  mediaPickerButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'white',
    marginBottom: 15,
    padding: 16,
    borderRadius: 8,
    minHeight: 60,
    justifyContent: 'center',
  },
  videoPreviewWrap: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 520,
    borderRadius: 18,
    marginBottom: 15,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
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
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 34,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  submitButtonText: {
    color: '#24160B',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#24160B',
    fontWeight: '600',
  },
});