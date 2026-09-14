# Apple / Vyaamikk JWS test fixtures (VYD-33)

These files are used only by offline unit tests. CI never fetches them from
the network.

## Official Apple library vectors

Copied from the MIT-licensed public repository:

- Project: https://github.com/apple/app-store-server-library-node
- Tag: `v3.1.0` (library version `@apple/app-store-server-library@3.1.0`)
- Paths:
  - `tests/resources/certs/testCA.der`
  - `tests/resources/mock_signed_data/transactionInfo`
  - `tests/resources/mock_signed_data/renewalInfo`
  - `tests/resources/mock_signed_data/testNotification`
  - `tests/resources/mock_signed_data/missingX5CHeaderClaim`
  - `tests/resources/mock_signed_data/wrongBundleId`

License: MIT, Copyright (c) 2023 Apple Inc.

These vectors exercise the **real** `SignedDataVerifier` (signature,
certificate chain, bundle id, environment). They use Apple's sample
bundle `com.example` and are not Vyaamikk production identifiers.

## Vyaamikk local test PKI

`vyaamikk-test-pki/` is a **test-only** ECDSA P-256 certificate chain
generated for this repository. It is not an Apple root and is never used
in production.

The chain embeds the Apple receipt-signing OIDs that
`SignedDataVerifier.verifyCertificateChainWithoutCaching` requires:

- intermediate: `1.2.840.113635.100.6.2.1`
- leaf: `1.2.840.113635.100.6.11.1`

Tests sign Vyaamikk-shaped transaction / renewal / notification payloads
with `leaf.p8` and verify them through the official `SignedDataVerifier`
with `enableOnlineChecks=false` and this local root. No OCSP or App Store
network calls occur.

Do not treat `leaf.p8` as App Store Connect material. Production
`APPSTORE_PRIVATE_KEY` is never committed.
