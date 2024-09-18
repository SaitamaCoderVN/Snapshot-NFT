import AsyncStorage from '@react-native-async-storage/async-storage';

const SHARED_SECRET_KEY = 'sharedSecret';
const SESSION_KEY = 'session';

export const saveSharedSecret = async (sharedSecret: Uint8Array) => {
  try {
    await AsyncStorage.setItem(SHARED_SECRET_KEY, JSON.stringify(Array.from(sharedSecret)));
  } catch (error) {
    console.error('Error saving shared secret:', error);
  }
};

export const getSharedSecret = async (): Promise<Uint8Array | null> => {
  try {
    const value = await AsyncStorage.getItem(SHARED_SECRET_KEY);
    return value ? new Uint8Array(JSON.parse(value)) : null;
  } catch (error) {
    console.error('Error retrieving shared secret:', error);
    return null;
  }
};

export const saveSession = async (session: string) => {
  try {
    await AsyncStorage.setItem(SESSION_KEY, session);
  } catch (error) {
    console.error('Error saving session:', error);
  }
};

export const getSession = async (): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(SESSION_KEY);
    return value;
  } catch (error) {
    console.error('Error retrieving session:', error);
    return null;
  }
};