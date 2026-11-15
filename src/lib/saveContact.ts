import { Alert } from 'react-native';

import type { ContactCard } from './vcard';

/**
 * Opens the phone's own "New contact" form, filled in from a contact card. Nothing is saved
 * until the person taps Done (iPhone) or Save (Android), and the app never reads the
 * address book: Android hands the form to the Contacts app, iOS shows Apple's contact form.
 *
 * Resolves to true when a contact was saved.
 */
export async function saveToContacts(card: ContactCard): Promise<boolean> {
  try {
    // Loaded on first use, so a build without the native module still starts.
    const { Contact } = await import('expo-contacts');
    const hasNameParts = Boolean(card.givenName || card.familyName);
    return await Contact.presentCreateForm({
      givenName: (hasNameParts ? card.givenName : card.fullName) || undefined,
      familyName: card.familyName || undefined,
      company: card.organisation || undefined,
      jobTitle: card.jobTitle || undefined,
      phones: card.phones.map((p) => ({ label: p.label, number: p.number })),
      emails: card.emails.map((e) => ({ label: e.label, address: e.address })),
      urlAddresses: card.urls.map((url) => ({ label: 'homepage', url })),
    });
  } catch (error) {
    Alert.alert('Couldn’t open Contacts', error instanceof Error ? error.message : 'Copy the details and add the contact yourself.');
    return false;
  }
}
