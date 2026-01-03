import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Purchases from 'react-native-purchases';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import SignUpScreen from './screens/SignUpScreen';
import PostPickScreen from './screens/PostPickScreen';
import EditPickScreen from './screens/EditPickScreen';
import ProfileScreen from './screens/ProfileScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    Purchases.configure({
      apiKey: Platform.select({
        ios: 'appl_mieNuuRVDtnWaueMwwMXREAcLdt',
      }),
    });
  }, []);
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#24160B', // brown
          },
          headerTintColor: '#fff',
          headerTitleAlign: 'center',
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            headerLeft: () => null,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="PostPick" component={PostPickScreen} />
        <Stack.Screen name="EditPickScreen" component={EditPickScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}