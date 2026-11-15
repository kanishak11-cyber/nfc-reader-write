# Store upload assets

Everything the App Store and Google Play ask for when you publish NFC Doctor: images, listing text and the answers to their questionnaires. The steps for building and submitting are in the main [README](../README.md#publishing-to-the-app-store-and-google-play).

## Files

| File | Store | Where it goes | Spec |
|---|---|---|---|
| `ios/iphone-6.9/*.png` | App Store | App Store Connect → your version → iPhone screenshots (6.9" display) | 1320 × 2868 PNG, up to 10 |
| `android/phone/*.png` | Google Play | Play Console → Main store listing → Phone screenshots | 1080 × 1920 PNG, 2–8 |
| `android/icon-512.png` | Google Play | Main store listing → App icon | 512 × 512 PNG |
| `android/feature-graphic.png` | Google Play | Main store listing → Feature graphic | 1024 × 500 PNG, no transparency |

The App Store icon isn't uploaded separately: it comes from the build (`assets/icon.png`). The iPad isn't supported (`supportsTablet: false`), so no iPad screenshots are needed.

### Regenerating

- **Icon and feature graphic**: `python3 scripts/make-icons.py node_modules/@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf assets store` (needs Python with Pillow). It redraws the app icons in `assets/` too.
- **Screenshots**: see [Store screenshots](../README.md#store-screenshots) in the main README. They're taken from the real app running on a simulator and an emulator, with simulated NFC tags.

## Listing text

Limits are in brackets. Copy each block as it is.

### Both stores

- **App name** [30]: `NFC Doctor`
- **Category**: Utilities (App Store), Tools (Google Play)
- **Price**: Free. No ads, no in-app purchases.
- **Privacy policy URL**: `https://github.com/kanishak11-cyber/nfc-reader-write/blob/master/PRIVACY.md`
- **Support URL / website**: `https://github.com/kanishak11-cyber/nfc-reader-write`

App Store names must be unique. If `NFC Doctor` is taken, use `NFC Doctor: Tag Tools` and keep the home-screen name as it is.

### App Store

**Subtitle** [30]

```
Read, write & fix NFC tags
```

**Promotional text** [170]

```
Find out why a tag won't write. NFC Doctor reads the chip's own settings and tells you in plain words: locked, password protected, or guarded by a card key.
```

**Keywords** [100]

```
nfc,tag,reader,writer,ntag,ntag215,ntag424,rfid,sticker,erase,lock,password,diagnose,uid,ndef
```

### Google Play

**Short description** [80]

```
Read, write, lock and diagnose NFC tags. Find out why a tag won't write.
```

### Description (both stores) [4000]

```
NFC Doctor reads, writes, protects and diagnoses NFC tags, and tells you in plain words why a tag won't do what you want.

READ
See a tag's serial number (UID), chip type, memory used and whether it's locked, plus every record on it: links, text, phone numbers, email, SMS, locations, Wi-Fi networks, contact cards and more. Open links, copy values, or look at the raw bytes.

WRITE
Put a link, text, phone number, email, contact card or Wi-Fi network on a tag. A contact card lets anyone who taps it save your name and number. NFC Doctor shows the size before you write, checks it against the tag, and formats blank tags first.

DIAGNOSE
Can't write or erase a tag? NFC Doctor reads the chip's own settings and explains what's stopping it: permanent lock bits, a tag password, or the key that guards an NTAG 424 DNA card. For NTAG 424 DNA cards it can check whether the factory key is still set, and reset the card to a blank, writable tag when it is.

PROTECT
Lock an NTAG21x or MIFARE Ultralight EV1 tag with its built-in password so nobody else can overwrite it. Secure an NTAG 424 DNA card with your own AES key, made from a passphrase you choose. Remove the lock again whenever you like.

ERASE
Clear a tag so it's blank and ready to write.

HISTORY
Every read, write, erase, lock and diagnosis is saved on your phone, so you can look back or write the same content again. Passwords, passphrases and keys are never saved.

PRIVATE BY DESIGN
No account, no ads, no tracking. Nothing leaves your phone.

OPEN SOURCE
NFC Doctor is free and open source under the MIT License.

Works with NTAG213, NTAG215, NTAG216, NTAG 424 DNA, MIFARE Ultralight, ICODE (ISO 15693), MIFARE DESFire and FeliCa Lite-S tags. What each phone supports varies: the app's Supported tags screen shows the list for yours.

Requires a phone with NFC. On iPhone, Wi-Fi tags can be written but iPhones don't join networks from them.
```

## Questionnaires

### App Store Connect

- **App Privacy**: Data Not Collected.
- **Age rating**: answer None / No to every question → 4+.
- **Encryption**: `app.json` sets `usesNonExemptEncryption: false`, so App Store Connect doesn't ask. The app's only cryptography is AES-128, used to authenticate with NTAG 424 DNA cards and to make their keys. Check Apple's export compliance guidance and change the setting if that applies to you.
- **Sign-in required**: No.
- **App Review notes**:

```
No account or sign-in is needed.

Reading, writing, erasing, protecting and diagnosing all need a physical NFC tag held against the top of the iPhone. An NTAG213/215/216 sticker shows everything except the NTAG 424 DNA features. Without a tag, the scan sheet appears and can be cancelled; History, Supported tags and the Write and Protect forms can be explored without one.

Nothing is sent off the device: there is no server, analytics or advertising.
```

### Google Play Console (App content)

- **Privacy policy**: the URL above.
- **Ads**: No.
- **App access**: All functionality is available without special access. In the instructions, say that the app needs a physical NFC tag.
- **Content rating**: category Utility, productivity, communication or other; answer No to everything.
- **Target audience**: 13 and over (keeps the app outside the Families policy).
- **Data safety**: No data collected, no data shared. Data is not encrypted in transit because none is sent. Users can delete their history in the app.
- **Health apps**: not a health app. The name says Doctor, but the app diagnoses NFC tags, not people.
- **Government, financial features, news**: No / None.
- **Contact details**: Play requires a contact email; enter your support address in Play Console.
