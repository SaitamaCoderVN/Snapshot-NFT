import { CameraView, CameraType, useCameraPermissions, Camera } from 'expo-camera';
import { useState, useRef } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Modal, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import ChoosePicture from '@/components/ChoosePicture';

export default function CameraScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showChoosePicture, setShowChoosePicture] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  async function takePicture() {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      if (!photo) {
        console.log('Failed to take picture');
        return;
      }
      console.log(photo);
      setPhotoUri(photo.uri);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        const asset = await MediaLibrary.createAssetAsync(photo.uri);
        const album = await MediaLibrary.getAlbumAsync('Camera');
        if (album == null) {
          await MediaLibrary.createAlbumAsync('Camera', asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
        console.log('Photo saved to album');
      } else {
        console.log('Permission to access media library is not granted');
      }

      // Chuyển sang component ChoosePicture
      setShowChoosePicture(true);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.container}>
          {showChoosePicture ? (
            <ChoosePicture visible={showChoosePicture} onClose={() => setShowChoosePicture(false)} photoUri={photoUri} />
          ) : (
            <>
              <CameraView ref={cameraRef} style={styles.camera} facing={facing}/>
              <View>
                <Btn title="Flip Camera" onPress={toggleCameraFacing} />
                <Btn title="Take Picture" onPress={takePicture} />
                <Btn title="Close" onPress={onClose} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 1)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 10,
    padding: 10,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    flexDirection: 'row'
  },
  button: {
    flex: 1,
    alignSelf: 'flex-end',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  preview: {
    width: '100%',
    height: 200,
    marginTop: 10,
  },
});

const Btn = ({ title, onPress }: { title: string; onPress: () => void | Promise<void> }) => {
  return (
    <View style={{ marginVertical: 10 }}>
      <Button title={title} onPress={onPress} />
    </View>
  );
};
