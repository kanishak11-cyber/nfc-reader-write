/**
 * Simulated NFC for store screenshots. Simulators and emulators have no NFC, so with
 * NFC_MOCK=1 set when bundling, metro.config.js swaps react-native-nfc-manager for this
 * file. The real app code then runs unchanged against two simulated NTAG215 tags:
 *
 * - Read and write: an unlocked tag holding a link and a text record.
 * - Diagnose: a tag whose writing is guarded by a password from page 4.
 *
 * Never bundle a release with NFC_MOCK set.
 */
import RealNfcManager, { Ndef, NdefStatus, NfcTech } from 'react-native-nfc-manager';

export * from 'react-native-nfc-manager';

const ios = require('react-native').Platform.OS === 'ios';
const SCAN_DELAY_MS = 2500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CAPACITY = 492;

const READ_TAG = {
  id: '04A23F1C8B7280',
  ndefMessage: [Ndef.uriRecord('https://example.com/menu'), Ndef.textRecord('Table 12, scan to order')],
  ...(ios
    ? { tech: 'mifare' }
    : {
        type: 'NFC Forum Type 2',
        maxSize: CAPACITY,
        isWritable: true,
        canMakeReadOnly: true,
        techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight', 'android.nfc.tech.Ndef'],
        atqa: [0x44, 0x00],
        sak: 0x00,
      }),
};

const DIAGNOSE_TAG = {
  id: '041B77E25A6180',
  ...(ios ? { tech: 'mifare' } : { techTypes: ['android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight', 'android.nfc.tech.Ndef'], atqa: [0x44, 0x00], sak: 0x00 }),
};

/** NTAG215 answers for the Type 2 commands Diagnose sends: READ 0, GET_VERSION, READ 0x82. */
const TYPE2_REPLIES = {
  '30-00': [0x04, 0x1b, 0x77, 0xe0, 0xe2, 0x5a, 0x61, 0x80, 0x59, 0x48, 0x00, 0x00, 0xe1, 0x10, 0x3e, 0x00],
  '60': [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x11, 0x03],
  // Dynamic lock bytes clear; CFG0 with AUTH0 = 0x04 (password from page 4); CFG1 ACCESS = 0 (writes only).
  '30-82': [0x00, 0x00, 0x00, 0xbd, 0x04, 0x00, 0x00, 0x04, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
};

let connected = null;

const mock = {
  start: async () => {},
  isSupported: async () => true,
  isEnabled: async () => true,
  goToNfcSetting: async () => true,
  requestTechnology: async (techs) => {
    const list = Array.isArray(techs) ? techs : [techs];
    await wait(SCAN_DELAY_MS);
    connected = list.includes(NfcTech.Ndef) ? NfcTech.Ndef : list.includes(NfcTech.NfcA) ? NfcTech.NfcA : list[0];
    return connected;
  },
  cancelTechnologyRequest: async () => {
    connected = null;
  },
  getTag: async (options) => (options && options.readNdef === false ? DIAGNOSE_TAG : READ_TAG),
  setAlertMessageIOS: async () => {},
  invalidateSessionWithErrorIOS: async () => {},
  ndefHandler: {
    getNdefStatus: async () => ({ status: NdefStatus.ReadWrite, capacity: CAPACITY }),
    writeNdefMessage: async () => {
      await wait(400);
    },
  },
  nfcAHandler: {
    transceive: async (command) => {
      const reply = TYPE2_REPLIES[command.map((b) => b.toString(16).padStart(2, '0')).join('-')];
      if (!reply) throw new Error('NAK');
      return reply;
    },
  },
  isoDepHandler: {
    transceive: async () => {
      throw new Error('Not an ISO-DEP tag');
    },
  },
  nfcVHandler: {
    transceive: async () => {
      throw new Error('Not an ISO 15693 tag');
    },
  },
};

export default new Proxy(mock, {
  get: (target, key) => (key in target ? target[key] : RealNfcManager[key]),
});
