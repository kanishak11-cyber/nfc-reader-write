# NFC Doctor privacy policy

_Effective 15 November 2026_

NFC Doctor reads, writes, protects and diagnoses NFC tags. This policy covers the iOS and Android apps.

## What the app collects

Nothing. NFC Doctor has no accounts, no analytics, no advertising, no crash reporting and no server. It doesn't send any data off your phone, and the developer receives no information about you or how you use the app.

## What stays on your phone

- **History.** Each read, write, erase, lock and diagnosis is saved in a file inside the app's own storage on your phone, so you can look at it or write it again. That includes tag contents (for example a link or a Wi-Fi network name), tag serial numbers and chip types. You can delete one entry or clear all history in the app. Deleting the app deletes the history.
- **Never saved.** Tag passwords, card passphrases, card keys and Wi-Fi passwords are used only for the scan in progress and are never stored.

## Permissions

- **NFC.** Used only to talk to the tag you hold against the phone, when you start a read, write, erase, protect or diagnose.
- **Contacts.** The app never reads your contacts. When you tap **Save to contacts** on a contact card, it opens your phone's own New Contact form, filled in from the tag. Nothing is saved unless you tap Done (iPhone) or Save (Android). On Android the app doesn't request the contacts permission at all; on iPhone, iOS may ask for it the first time.
- **Internet.** The app makes no network requests itself. When you tap **Open link**, **Call** or a similar button on a tag's record, the link opens in another app (your browser, phone or mail app), whose own privacy policy applies.

## Contact page

A contact card written by the app can include a link to a contact page, so iPhones can save the contact without any app. The page is a static file hosted on GitHub Pages. The contact details are in the part of the link after `#`, which browsers never send to a server: the page reads them and builds the contact in the browser, and nothing is stored anywhere. Like any website, GitHub may log the visit (for example the visitor's IP address) under [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

## Children

The app doesn't collect personal information from anyone, including children.

## Changes

Changes to this policy are published in this file, with a new effective date. The history of every change is in the project's Git history.

## Contact

Questions about this policy: open an issue at <https://github.com/kanishak11-cyber/nfc-reader-write/issues>.
