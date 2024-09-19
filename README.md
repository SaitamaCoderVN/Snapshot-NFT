# Solana NFT Minter

## This project is built upon the [Solana Mobile Connect Phantom Expo Template](https://github.com/phantom/deep-link-demo-app.git)

<table>
  <tr>
    <td align="center" colspan="1">
      <img src="./assets/demo_product.gif" alt="Demo Product GIF" width=200 />
    </td>
  </tr>
</table>

## Technologies Used

| Library              | Type              | Version  | Description                                            |
| -------------------- | ----------------- | -------- | ------------------------------------------------------ |
| React Native         | Mobile Framework  | v0.74.5  | Cross-platform mobile app development framework        |
| Expo                 | SDK               | v51.0.32 | Supports React Native app development and deployment   |
| React                | UI Framework      | v18.2.0  | Popular JavaScript library for building user interfaces|
| Mobile Wallet Adapter| SDK               | v2.0     | Connects and requests signatures from mobile wallets   |
| Solana web3.js       | SDK               | v1.95.3  | Solana library for transactions and RPC                |
| Metaplex             | SDK               | v3.2.1   | Library for creating and managing NFTs on Solana       |
| React Native Paper   | Component Library | v5.12.5  | UI component library for React Native                  |
| React Navigation     | Navigation        | v6       | Navigation library for React Native                    |
| TypeScript           | Language          | v5.3.3   | Statically typed programming language                  |
| AsyncStorage         | Persistence       | v1       | Local data storage for React Native                    |

## Quick Start

### Requirements

- A free [Expo](https://expo.dev/) account.
- Android device/emulator for testing the app
  - Install an MWA-compatible wallet app on your device/emulator.
- If using Expo's cloud service `eas build`, no additional setup is needed.
- For local builds:
  - Set up React Native and Android environment
    [guide](https://docs.solanamobile.com/getting-started/development-setup)

### Initialization

Run the following CLI commands:

```
git clone https://github.com/your-repo/snapshotNFT-Solana.git
cd snapshotNFT-Solana
yarn
yarn start
```

### Building and Running the App

After initializing the app, follow the
**["Running the app"](https://docs.solanamobile.com/react-native/expo#running-the-app)**
guide to launch the sample as a custom development build.

## Notes

- This app is fully functional only on Android. iOS is not supported.
- The project uses the `expo-camera` plugin, which is not supported on Android emulators for Expo v50.0.0 and below. Testing must be done on a physical Android device. For more information, see
  [platform compatibility](https://docs.expo.dev/versions/v50.0.0/sdk/camera/#platform-compatibility)

## Key Features

- Connect with Phantom wallet
- Capture photos and retrieve GPS location
- Create and mint NFTs with metadata including image and location information
- Upload images and metadata to Supabase
- Mint NFTs on Solana Devnet

## Current Issues

- Minting NFTs through Phantom deeplink is currently problematic. NFTs are being minted directly without going through the Phantom wallet.
- Error handling and user experience need improvement.

For more information on creating NFTs on Solana, refer to:
- [Metaplex JavaScript SDK](https://github.com/metaplex-foundation/js?tab=readme-ov-file#metaplex-javascript-sdk)
- [NFT Creation Guide](https://developers.metaplex.com/token-metadata/guides/javascript/create-an-nft)
