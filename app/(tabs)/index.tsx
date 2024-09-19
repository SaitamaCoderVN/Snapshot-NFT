import { Image, StyleSheet, Button, Platform, ScrollView, Text, View  } from 'react-native';
import 'react-native-url-polyfill/auto';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { Keypair, clusterApiUrl, Connection, PublicKey, SystemProgram, Transaction, SendTransactionError } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import nacl from "tweetnacl";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, createNft } from '@metaplex-foundation/mpl-token-metadata';
import { keypairIdentity, generateSigner,  percentAmount } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair, fromWeb3JsPublicKey, toWeb3JsInstruction, toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import type { Umi } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi-serializers";
import CameraScreen from '@/components/Camera';
import { usePhantomWallet } from '@/context/PhantomWalletContext';
import { saveSharedSecret, getSharedSecret, saveSession, getSession } from '@/utils/storage';

global.Buffer = global.Buffer || Buffer;
global.process = process;

const NETWORK = clusterApiUrl("devnet");

export const onConnectRedirectLink = Linking.createURL("onConnect");
export const onDisconnectRedirectLink = Linking.createURL("onDisconnect");
export const onSignAndSendTransactionRedirectLink = Linking.createURL("onSignAndSendTransaction");
export const onSnapshotNftRedirectLink = Linking.createURL("snapshotNft");

export const [dappKeyPair] = useState(nacl.box.keyPair());

/**
 * If true, uses universal links instead of deep links. This is the recommended way for dapps
 * and Phantom to handle deeplinks as we own the phantom.app domain.
 *
 * Set this to false to use normal deeplinks, starting with phantom://. This is easier for
 * debugging with a local build such as Expo Dev Client builds.
 */
const useUniversalLinks = false;
export const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

export const decryptPayload = (data: string, nonce: string, sharedSecret?: Uint8Array) => {
  if (!sharedSecret) throw new Error("missing shared secret");

  const decryptedData = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
  if (!decryptedData) {
    throw new Error("Unable to decrypt data");
  }
  return JSON.parse(Buffer.from(decryptedData).toString("utf8"));
};

export const encryptPayload = (payload: any, sharedSecret?: Uint8Array) => {
  if (!sharedSecret) throw new Error("missing shared secret");

  const nonce = nacl.randomBytes(24);

  const encryptedPayload = nacl.box.after(
    Buffer.from(JSON.stringify(payload)),
    nonce,
    sharedSecret
  );

  return [nonce, encryptedPayload];
};

export function createUmiInstance(keypair: Keypair): Umi {
  return createUmi(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com')
    .use(mplTokenMetadata())
    .use(keypairIdentity(fromWeb3JsKeypair(keypair)));
}

export default function HomeScreen() {
  const { phantomWalletPublicKey, setPhantomWalletPublicKey } = usePhantomWallet();
  const [deepLink, setDeepLink] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const connection = new Connection(NETWORK);
  const addLog = useCallback((log: string) => setLogs((logs) => [...logs, "> " + log]), []);
  const clearLog = useCallback(() => setLogs(() => []), []);
  const scrollViewRef = useRef<any>(null);
  const [isCameraVisible, setCameraVisible] = useState(false);

  // store dappKeyPair, sharedSecret, session and account SECURELY on device
  // to avoid having to reconnect users.

  const [sharedSecret, setSharedSecret] = useState<Uint8Array>();
  const [session, setSession] = useState<string>();

  useEffect(() => {
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        setDeepLink(initialUrl);
      }
    })();
    const subscription = Linking.addEventListener("url", handleDeepLink);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = ({ url }: Linking.EventType) => {
    setDeepLink(url);
  };

  // handle inbounds links
  useEffect(() => {
    if (!deepLink) return;

    const url = new URL(deepLink);
    const params = url.searchParams;

    if (params.get("errorCode")) {
      addLog(JSON.stringify(Object.fromEntries([...params]), null, 2));
      return;
    }

    if (/onConnect/.test(url.pathname || url.host)) {
      console.log( "phantom_encryption_public_key", bs58.decode(params.get("phantom_encryption_public_key")!));
      
      const sharedSecretDapp = nacl.box.before(
        bs58.decode(params.get("phantom_encryption_public_key")!),
        dappKeyPair.secretKey
      );
      console.log("sharedSecretDapp", sharedSecretDapp);

      const connectData = decryptPayload(
        params.get("data")!,
        params.get("nonce")!,
        sharedSecretDapp
      );

      setSharedSecret(sharedSecretDapp);
      setSession(connectData.session);
      saveSharedSecret(sharedSecretDapp);
      saveSession(connectData.session);
      setPhantomWalletPublicKey(new PublicKey(connectData.public_key));

      console.log("Public Key: ", phantomWalletPublicKey);

      addLog(JSON.stringify(connectData, null, 2));
    } else if (/onDisconnect/.test(url.pathname || url.host)) {
      setPhantomWalletPublicKey(undefined);
      addLog("Disconnected!");
    } else if (/onSignAndSendTransaction/.test(url.pathname || url.host)) {
      console.log("params", params);
      console.log("Public Key: ", phantomWalletPublicKey);

      const signAndSendTransactionData = decryptPayload(
        params.get("data")!,
        params.get("nonce")!,
        sharedSecret
      );

      console.log("signAndSendTransactionData", signAndSendTransactionData);

      addLog(JSON.stringify(signAndSendTransactionData, null, 2));
    } else if (/snapshotNft/.test(url.pathname || url.host)) {
      console.log("params", params);
      console.log("Public Key: ", phantomWalletPublicKey);


      const snapshotNftData = decryptPayload(
        params.get("data")!,

        params.get("nonce")!,

        sharedSecret
      );

      console.log("snapshotNftData", snapshotNftData);


      addLog(JSON.stringify(snapshotNftData, null, 2));

    }
  }, [deepLink]);

  const createTransferTransaction = async () => {
    if (!phantomWalletPublicKey) throw new Error("missing public key from user");
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: phantomWalletPublicKey,
        toPubkey: new PublicKey("38rc27bLd73QUDKmiDBQjsmbXpxinx8metaPFsRPSCWi"),
        lamports: 10000000
      })
    );
    transaction.feePayer = phantomWalletPublicKey;
    addLog("Getting recent blockhash");
    const anyTransaction: any = transaction;
    anyTransaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    return transaction;
  };

  const connect = async () => {
    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      cluster: "devnet",
      app_url: "https://phantom.app",
      redirect_link: onConnectRedirectLink
    });

    const url = buildUrl("connect", params);
    Linking.openURL(url);
  };

  const disconnect = async () => {
    const payload = {
      session
    };
    const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: onDisconnectRedirectLink,
      payload: bs58.encode(encryptedPayload)
    });

    const url = buildUrl("disconnect", params);
    Linking.openURL(url);
  };

  const signAndSendTransaction = async () => {
    const transaction = await createTransferTransaction();

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false
    });

    console.log("serializedTransaction", serializedTransaction);

    const payload = {
      session,
      transaction: bs58.encode(serializedTransaction)
    };
    const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: onSignAndSendTransactionRedirectLink,
      payload: bs58.encode(encryptedPayload)
    });

    addLog("Sending transaction...");
    const url = buildUrl("signAndSendTransaction", params);
    Linking.openURL(url);
  };

  const snapshotNft = async () => {
    try {
      console.log("phantomWalletPublicKey", phantomWalletPublicKey);
      // Mint NFT
      const keypair = Keypair.fromSecretKey(
        bs58.decode(
          process.env.PRIVATE_KEY!.toString()
        )
      );

      console.log("keypair", keypair.publicKey);
      const umi = createUmiInstance(keypair);
      const mint = generateSigner(umi);
      console.log("mint", mint);

      
      // =========================================================================
      // Use Phantom deeplink
      // Error: Phantom deeplink not working

      const builder = await createNft(umi, {
        mint,
        name: 'Shit NFT',
        uri: "https://peach-realistic-spider-498.mypinata.cloud/ipfs/QmQNEoAnnNmyacZmEMTSH39B2E2SMMB89fHZHZjyu5yd3R",
        sellerFeeBasisPoints: percentAmount(5.5),
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
      addLog("Raw transaction: " + serializedTransaction.toString('base64'));

      console.log("serializedTransaction", serializedTransaction);

      const payload = {
        session,
        transaction: bs58.encode(serializedTransaction)
      };
      const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: onSnapshotNftRedirectLink,
        payload: bs58.encode(encryptedPayload)
      });

      addLog("Sending transaction...");
      const url = buildUrl("signTransaction", params);
      await Linking.openURL(url);

      console.log("============================================");

      // =========================================================================
      // No use Phantom deeplink
      
      let tx;

      tx = await createNft(umi, {
        mint: mint,
        sellerFeeBasisPoints: percentAmount(5.5),
        name: "My Compressed NFT",
        uri: "https://peach-realistic-spider-498.mypinata.cloud/ipfs/QmQNEoAnnNmyacZmEMTSH39B2E2SMMB89fHZHZjyu5yd3R",
      }).sendAndConfirm(umi, {
        send: { skipPreflight: true, commitment: "confirmed", maxRetries: 3 },
      });

      const signature = base58.deserialize(tx.signature)[0];

      console.log(
        "transaction: ",
        `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );

      addLog(`Transaction successfull: ${signature}`);

    } catch (error) {
      console.error("Lỗi:", error);
      addLog("Error: " + (error as Error).message);
      console.log("Error: " + (error as Error).message);
    }
  };

  const waitForRedirect = (): Promise<{ signature: string }> => {
    return new Promise((resolve) => {
      const handleRedirect = ({ url }: Linking.EventType) => {
        const params = new URL(url).searchParams;
        const signature = params.get("signature");
        if (signature) {
          resolve({ signature });
        }
      };

      const subscription = Linking.addEventListener("url", handleRedirect);
      return () => {
        subscription.remove();
      };
    });
  };

  

  return (
    <View style={{ flex: 1, backgroundColor: "#333" }}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            backgroundColor: "#111",
            padding: 20,
            paddingTop: 100,
            flexGrow: 1
          }}
          ref={scrollViewRef}
          onContentSizeChange={() => {
            scrollViewRef.current.scrollToEnd({ animated: true });
          }}
          style={{ flex: 1 }}
        >
          {logs.map((log, i) => (
            <Text
              key={`t-${i}`}
              style={{
                fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
                color: "#fff",
                fontSize: 14
              }}
            >
              {log}
            </Text>
          ))}
        </ScrollView>
      </View>
      <View >
        <Btn title="Connect" onPress={connect} />
        <Btn title="Disconnect" onPress={disconnect} />
        {/* <Btn title="Sign And Send Transaction" onPress={signAndSendTransaction} /> */}
        {/* <Btn title="Snapshot NFT" onPress={snapshotNft} /> */}
        <Btn title="Take Picture and Mint NFT Location" onPress={() => setCameraVisible(true)} />
        <Btn title="Clear Logs" onPress={clearLog} />
      </View>
      <CameraScreen visible={isCameraVisible} onClose={() => setCameraVisible(false)} />
    </View>
  );
}

const Btn = ({ title, onPress }: { title: string; onPress: () => void | Promise<void> }) => {
  return (
    <View style={{ marginVertical: 10 }}>
      <Button title={title} onPress={onPress} />
    </View>
  );
};