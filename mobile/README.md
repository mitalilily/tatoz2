# Tatoz Android app

Expo Router app for the Tatoz storefront. Store, CMS, catalog, product, cart, customer and checkout data are loaded through the existing Tatoz API, which reads and writes the same database as the website. Session tokens are stored with Expo SecureStore; the app does not connect to MongoDB directly.

## Run locally

```sh
npm install
npx expo start
```

The API base defaults to `https://tatoz.com/api`. To point a development build at another API, set `EXPO_PUBLIC_API_URL` before starting Expo.

## Android build

```sh
npx eas-cli build --platform android --profile preview
```

The preview profile produces an installable APK. A production build uses the `production` profile and produces an Android App Bundle.

## Store configuration

Sign-in methods, site branding, theme, header/footer, CMS sections, catalog records, product details, coupons, shipping quotes and payment gateways are read from Tatoz APIs. The current app supports the active COD and Razorpay flows. If another payment gateway is activated in the store, its native payment flow must be added before customers can use it in the app.

Android Google sign-in requires an Android OAuth client ID for package `com.tatoz.store` and the signing certificate SHA-1. The live auth API currently exposes only the web client ID, so the app presents phone OTP as the available sign-in path until an Android client ID is configured.

Some live product image records currently contain `blob:` URLs. Those are browser-only references and cannot load in a native app; re-upload those images through the store admin so the product API returns permanent URLs.
