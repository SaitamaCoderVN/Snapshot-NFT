import { CameraView, CameraType, useCameraPermissions, Camera } from 'expo-camera';
import { useState, useRef, useEffect } from 'react';
import { Button, StyleSheet, Text, View, Modal, Image } from 'react-native';
import * as Location from 'expo-location';
import { TextInput } from 'react-native-paper';
import * as FileSystem from "expo-file-system";
import { supabase } from "./supabase";
import { usePhantomWallet } from '@/context/PhantomWalletContext';
import { Keypair, clusterApiUrl, Connection, PublicKey, SystemProgram, Transaction, SendTransactionError } from "@solana/web3.js";
import bs58 from "bs58";
import { generateSigner,  percentAmount } from '@metaplex-foundation/umi';
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
  const [photoUri, setPhotoUri] = useState<string | null>(initialPhotoUri);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [text, setText] = useState('Waiting..');
  const [nameNFT, setNameNFT] = useState('');
  const [sharedSecret, setSharedSecret] = useState<Uint8Array | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);

  const connection = new Connection(NETWORK);

  const [bucket, setBucket] = useState(process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET!);
  console.log("bucket", process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET);

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

  const reverseGeocode = async() => {
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
    console.log("phantomWalletPublicKey", phantomWalletPublicKey);
    console.log("photoUri", photoUri);

    if (!photoUri) {
      alert("No photo selected.");
      return;
    }

    try {
      const newFileName = `nft_image_${Date.now()}.jpg`;
      setNewFileName(newFileName);
      const newFilePath = `${FileSystem.documentDirectory}public/${newFileName}`;
      
      await FileSystem.copyAsync({
        from: photoUri,
        to: newFilePath
      });

      console.log("newFilePath", newFilePath);
      setPhotoUri(newFilePath);
      console.log("Updated photoUri", newFilePath);
    } catch (error) {
      console.error("Error:", error);
      alert("Error. Please try again.");
      return;
    }

    console.log(" new photoUri", photoUri);

    // if (!phantomWalletPublicKey || !photoUri) {
    //   alert("Minting failed. Missing account or photo.");
    //   return;
    // }

    const locationData = location?.coords;
    console.log("locationData", locationData);
    // if (!locationData) {
    //   alert("Minting failed. Location coordinates not found.");
    //   return;
    // }

    try {
      const base64ImageFile = await FileSystem.readAsStringAsync(photoUri!, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log("base64ImageFile");
      // console.log("base64ImageFile", base64ImageFile);
      console.log("newFileName", newFileName);
      const { data: imageResponse, error: imageError } = await supabase.storage
        .from(bucket)
        .upload(
          `public/${newFileName}.jpg`,
          decode(base64ImageFile),
          {
            upsert: true,
          }
        );

      console.log("imageResponse", imageResponse);

      if (imageError) {
        alert("Minting failed. Error uploading image.");
        return;
      }

      console.log("imageResponse", imageResponse);

      const { data: storedFile } = supabase.storage
        .from(bucket)
        .getPublicUrl(imageResponse?.path || "");

      console.log("storedFile", storedFile.publicUrl);

      const metadata = {
        name: nameNFT,
        description: "This NFT was minted with location data.",
        image: storedFile.publicUrl,
        attributes: [
          { trait_type: "Latitude", value: locationData?.latitude },
          { trait_type: "Longitude", value: locationData?.longitude },
        ],
        creators: [{ address: phantomWalletPublicKey?.toBase58() || "", share: 100 }],
      };

      // console.log("metadata", metadata);

      const { data: metadataResponse, error: metadataError } = await supabase.storage
        .from(bucket)
        .upload(photoUri!, JSON.stringify(metadata), { contentType: "application/json", upsert: true });

      if (metadataError) {
        alert("Minting failed. Error uploading metadata.");
        return;
      }

      const { data: metadataUri } = supabase.storage
        .from(bucket)
        .getPublicUrl(metadataResponse.path);

      // Mint NFT
      const keypair = Keypair.fromSecretKey(
        bs58.decode(
          process.env.PRIVATE_KEY!
        )
      );

      const umi = createUmiInstance(keypair);

      const mint = generateSigner(umi);
      
      // console.log("mint", mint);

      // =========================================================================
      // Use Phantom deeplink
      // Error: Phantom deeplink not working

      const builder = await createNft(umi, {
        mint: mint,
        sellerFeeBasisPoints: percentAmount(5.5),
        name: metadata.name,
        uri: metadataUri.publicUrl,
      });

      const ixs = builder.getInstructions().map(toWeb3JsInstruction);

      const transaction = new Transaction().add(...ixs);

      transaction.feePayer = phantomWalletPublicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
      console.log("transaction", transaction);

      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false
      });

      console.log("Raw transaction:", serializedTransaction.toString('base64'));
      alert("Raw transaction: " + serializedTransaction.toString('base64'));

      console.log("serializedTransaction", serializedTransaction);

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

      alert("Sending transaction...");
      const url = buildUrl("signTransaction", params);
      await Linking.openURL(url);

      console.log("============================================");

      // =========================================================================
      // No use Phantom deeplink
      
      let tx;

      tx = await createNft(umi, {
        mint: mint,
        sellerFeeBasisPoints: percentAmount(5.5),
        name: metadata.name,
        uri: metadataUri.publicUrl,
      }).sendAndConfirm(umi, {
        send: { skipPreflight: true, commitment: "confirmed", maxRetries: 3 },
      });

      const signature = base58.deserialize(tx.signature)[0];

      console.log(
        "transaction: ",
        `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );

      alert(`Transaction successfull: ${signature}`);

      // await createNft(umi, {
      //   mint,
      //   sellerFeeBasisPoints: percentAmount(5.5),
      //   name: metadata.name,
      //   uri: metadataUri.publicUrl,
      // }).sendAndConfirm(umi, { send: { skipPreflight: true, commitment: "confirmed", maxRetries: 3 } });
      
      console.log("NFT minted successfully!");

      alert("NFT minted successfully!");
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
            value={nameNFT}
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
