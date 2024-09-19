import { CameraView, CameraType, useCameraPermissions, Camera } from 'expo-camera';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, StyleSheet, Text, View, Modal, Image } from 'react-native';
import * as Location from 'expo-location';
import { TextInput } from 'react-native-paper';
import * as FileSystem from "expo-file-system";
import { supabase } from "./supabase";
import { usePhantomWallet } from '@/context/PhantomWalletContext';
import { Keypair, clusterApiUrl, Connection, PublicKey, SystemProgram, Transaction, SendTransactionError } from "@solana/web3.js";
import bs58 from "bs58";
import { generateSigner, percentAmount } from '@metaplex-foundation/umi';
import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import { buildUrl, createUmiInstance, dappKeyPair, encryptPayload, onSnapshotNftRedirectLink } from '@/app/(tabs)';
import { decode } from "base64-arraybuffer";
import { base58 } from '@metaplex-foundation/umi-serializers';
import * as Linking from "expo-linking";
import { fromWeb3JsKeypair, fromWeb3JsPublicKey, toWeb3JsInstruction, toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import { getSession, getSharedSecret } from '@/utils/storage';

const NETWORK = clusterApiUrl("devnet");

interface ChoosePictureProps {
  visible: boolean;
  onClose: () => void;
  photoUri: string | null;
}

export default function ChoosePicture({ visible, onClose, photoUri: initialPhotoUri }: ChoosePictureProps) {
  const { phantomWalletPublicKey } = usePhantomWallet();
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string>(initialPhotoUri!);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [text, setText] = useState('Waiting..');
  const [nameNFT, setNameNFT] = useState<string | null>(null);
  const [sharedSecret, setSharedSecret] = useState<Uint8Array | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const [newFileNameJson, setNewFileNameJson] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState<boolean>(false);
  const [signature, setSignature] = useState<string | null>(null);

  const connection = new Connection(NETWORK);

  const [bucket, setBucket] = useState(process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET!);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location as Location.LocationObject);
    })();
  }, []);

  const reverseGeocode = async () => {
    const reverseGeocodeAddress = await Location.reverseGeocodeAsync({
      longitude: location?.coords.longitude!,
      latitude: location?.coords.latitude!,
    });
    return reverseGeocodeAddress;
  }

  useEffect(() => {
    const fetchReverseGeocode = async () => {
      if (errorMsg) {
        setText(errorMsg);
      } else if (location) {
        try {
          const result = await reverseGeocode();
          const infoAddress = JSON.stringify(result);
          const text = JSON.parse(infoAddress)[0].formattedAddress;
          setText(text);
        } catch (error) {
          console.error('Error when reverse geocoding:', error);
        }
      }
    };
    fetchReverseGeocode();
  }, [location, errorMsg]);

  useEffect(() => {
    (async () => {
      const storedSharedSecret = await getSharedSecret();
      if (storedSharedSecret) {
        setSharedSecret(storedSharedSecret);
      }

      const storedSession = await getSession();
      if (storedSession) {
        setSession(storedSession);
      }
    })();
  }, []);
  

  useEffect(() => {
    const copyPhoto = async () => {
      if (hasRun === true) return;
      setHasRun(true);

      try {
        const newFileNameImage = `nft_image_${Date.now()}`;
        setNewFileName(newFileNameImage);

        

        const newFilePathImage = `${FileSystem.documentDirectory}public/images/${newFileNameImage}`;
        
        await FileSystem.copyAsync({
          from: photoUri,
          to: newFilePathImage
        });
        setPhotoUri(newFilePathImage);
      } catch (error) {
        console.error("Error copying photo:", error);
      }
    };

    if (photoUri && hasRun === false) {
      copyPhoto();
    }
  }, [photoUri, hasRun]);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  const createNFT = async () => {

    if (!photoUri) {
      alert("No photo selected.");
      return;
    }

    const locationData = location?.coords;

    try {
      const base64ImageFile = await FileSystem.readAsStringAsync(photoUri!, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { data: imageResponse, error: imageError } = await supabase.storage
        .from(bucket)
        .upload(
          `public/images/${newFileName}.jpg`,
          decode(base64ImageFile),
          {
            contentType: "image/jpg",
            upsert: true,
          }
        );

      if (imageError) {
        alert("Minting failed. Error uploading image.");
        return;
      }

      const { data: storedFile } = supabase.storage
        .from(bucket)
        .getPublicUrl(imageResponse?.path || "");

      const metadata = {
        name: nameNFT!,
        description: text,
        image: storedFile.publicUrl,
        attributes: [
          { trait_type: "Latitude", value: locationData?.latitude },
          { trait_type: "Longitude", value: locationData?.longitude },
        ],
        creators: [{ address: phantomWalletPublicKey?.toBase58() || "", share: 100 }],
      };

      const newFileNameJson = `nft_metadata_${Date.now()}`;
      setNewFileNameJson(newFileNameJson);

      const newFilePathJson = `${FileSystem.documentDirectory}public/metadata/${newFileNameJson}.jpg`;
      
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}public/metadata/`, { intermediates: true });
      await FileSystem.writeAsStringAsync(newFilePathJson, JSON.stringify(metadata), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Đọc nội dung của file metadata
      const metadataContent = await FileSystem.readAsStringAsync(newFilePathJson, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      console.log(`Content of public/metadata/${newFileNameJson}.jpg:`);
      console.log(metadataContent);

      const base64ImageFileJson = await FileSystem.readAsStringAsync(newFilePathJson, {
        encoding: FileSystem.EncodingType.Base64,
      });
        
      const { data: metadataResponse, error: metadataError } = await supabase.storage
        .from(bucket)
        .upload(
          `public/metadata/${newFileNameJson}.jpg`,
          JSON.stringify(metadata),
          { 
            contentType: "application/json", 
            upsert: true 
          }
        );

      if (metadataError) {
        console.log("metadataError", metadataError);
        alert("Minting failed. Error uploading metadata.");
        return;
      }

      const { data: metadataUri } = supabase.storage
        .from(bucket)
        .getPublicUrl(metadataResponse.path);

      const keypair = Keypair.fromSecretKey(
        bs58.decode(
          process.env.EXPO_PUBLIC_PRIVATE_KEY!.toString()
        )
      );

      try {
        const umi = createUmiInstance(keypair);
        const mint = generateSigner(umi);

        // =========================================================================
        // Use Phantom deeplink
        // Error: Phantom deeplink not working
  
        const builder = await createNft(umi, {
          mint: mint,
          sellerFeeBasisPoints: percentAmount(5.5),
          name: metadata.name.toString(),
          uri: metadataUri.publicUrl.toString(),
        });

        const ixs = builder.getInstructions().map(toWeb3JsInstruction);

        const transaction = new Transaction().add(...ixs);

        transaction.feePayer = phantomWalletPublicKey;
        transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;

        const serializedTransaction = transaction.serialize({
          requireAllSignatures: false
        });

        const payload = {
          session,
          transaction: bs58.encode(serializedTransaction)
        };

        const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret!);

        const params = new URLSearchParams({
          dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
          nonce: bs58.encode(nonce),
          redirect_link: onSnapshotNftRedirectLink,
          payload: bs58.encode(encryptedPayload)
        });

        const url = buildUrl("signTransaction", params);
        await Linking.openURL(url);

        // =========================================================================
        // No use Phantom deeplink
        
        let tx;

        tx = await createNft(umi, {
          mint: mint,
          sellerFeeBasisPoints: percentAmount(5.5),
          name: metadata.name.toString(),
          uri: metadataUri.publicUrl.toString(),
        }).sendAndConfirm(umi, {
          send: { skipPreflight: true, commitment: "confirmed", maxRetries: 3 },
        });

        const signature = base58.deserialize(tx.signature)[0];

        console.log(
          "transaction: ",
          `https://explorer.solana.com/tx/${signature}?cluster=devnet`
        );

        setSignature(signature);

      } catch (error) {
        console.log("error", error);
      }

      alert("NFT minted successfully!");
      alert(`Transaction successfull: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    } catch (error) {
      console.error("Error minting NFT:", error);
      alert("Minting failed. Check console for details.");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.container}>
          <Image source={{ uri: photoUri || undefined }} style={styles.preview} />
          <TextInput
            style={[stylesss.paragraph, { backgroundColor: 'white' }]}
            value={text}
            onChangeText={setText}
          />
          <TextInput
            style={styless.paragraph}
            placeholder='Name of the NFT'
            value={nameNFT!}
            onChangeText={setNameNFT}
          />
          <View>
            <Btn title="Create NFT" onPress={createNFT} />
            <Btn title="Close" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styless = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  paragraph: {
    fontSize: 18,
    textAlign: 'center',
  },
});

const stylesss = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  paragraph: {
    fontSize: 18,
    textAlign: 'center',
    color: "white",
  },
});

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
  preview: {
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
});

const Btn = ({ title, onPress }: { title: string; onPress: () => void | Promise<void> }) => {
  return (
    <View style={{ marginVertical: 10 }}>
      <Button title={title} onPress={onPress} />
    </View>
  );
};
