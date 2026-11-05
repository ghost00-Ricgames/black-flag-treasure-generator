# Black Flag Treasure Generator

**Foundry VTT v14** (including v14.370 target) • **Black Flag Roleplaying 3.x** • v0.2.0

GM-facing treasure generator that rolls against the **official Tales of the Valiant Game Master's Guide RollTables** already installed in your world. The generator is a companion module; it does not distribute the GMG's tables, magic item documents, artwork, or other licensed compendium data.

## Install

The manifest URL will work **after the first GitHub Release** is published:

https://github.com/ghost00-Ricgames/black-flag-treasure-generator/releases/latest/download/module.json

In Foundry VTT, open **Add-on Modules → Install Module → Manifest URL** and paste the URL. Enable the module in your Black Flag world alongside the official Game Master's Guide module.

**Requirements:** Foundry v14; Black Flag game system 3.0.075 or newer; official `kp-tov-game-masters-guide` enabled. The official GMG v13.0.0 was marked verified only through Foundry v13, so confirm its compendiums load properly in v14.

If updating an existing manual v0.2.0 installation, **back up the world and the private treasure budget Journal first**. Retain the same module ID (`black-flag-treasure-generator`) to keep budget data. Remove duplicate module folders. The in-world budget is not stored on GitHub.

## How it works

A Game Master's Guide treasure bundle covers a **multi-level adventure/story arc**, not a single fight. Our separate distribution layer provides these modes:

- **Encounter (default):** withdraw one of twenty shares of the selected complete bundle.
- **Adventure:** withdraw four shares (20%) of the complete bundle.
- **Full Bundle:** preview the complete pre-rolled budget without spending it.
- **Reset Budget:** explicitly discard the unawarded pool with confirmation, for a new level span.

The first generation rolls one whole GMG bundle using the installed tables, divides its contents among twenty allocations, and saves the budget into a private world Journal. The same existing pool is consumed on subsequent clicks; **no repeat full bundle generation** until reset. Across all shares, items and coins are conserved exactly.

The 20-share distribution is a **house rule**. It is not an alternative treasure-generation rule published by Kobold Press.

Supported level ranges: 1–3, 3–5, 5–7, 7–10, 10–13, 13–16, 16–20. Party size: 1–12. The book's alternate reward lines may be selected randomly, or consistently choose the first/second option.

The output is a summary of rolled treasure names and currency. Spell scroll selection and certain equipment rewards intentionally remain GM choices; inventory items are not automatically created.

## Privacy and server access

This repository only contains the generator's standalone source code, tests, and GitHub workflow. **It contains no access to any Foundry server**, no game-world files, and no licensed Kobold Press compendium database. GitHub Releases serve installation files for Foundry to download under the GM's control; they do not change a running world or give the author remote access.

Treasure budgets are saved locally in a private **Black Flag Treasure Budget (GM Only)** Journal; keep its player ownership set to None.

## Development and release

Test the source locally with Node.js:

```sh
node --check scripts/main.mjs
node --check scripts/bundles.mjs
node --check scripts/parcels.mjs
node tests/smoke.mjs
node tests/full-generator-mock.mjs
```

These tests mock Foundry v14 interfaces and verify conservation across level ranges, but they do not replace a live-world integration test.

Release workflow: `.github/workflows/release.yml`. When a tag matching `module.json.version` is pushed (currently `v0.2.0`), GitHub Actions will test and package `module.json` plus the runtime scripts/styles into `black-flag-treasure-generator.zip`, and upload both the ZIP and the versioned `module.json` as public release assets. The stable manifest URL above then becomes usable for Foundry.

**First-time release steps:**

1. Verify the source and Actions workflow on GitHub.
2. Go to **Releases → Draft a new release**.
3. Create a new tag **v0.2.0** targeting the `main` branch, publish the release, and check the Actions run.
4. Verify that the release contains both `module.json` and `black-flag-treasure-generator.zip`.
5. Only then paste the stable manifest URL into Foundry to install/update.

Each subsequent version should update both `version` and the version-specific `download` URL in the source `module.json`, then create the corresponding tag and release.

## Technical details

- Official GMG RollTable pack: `kp-tov-game-masters-guide.kp-tov-gmg-tables`
- Runtime uses non-mutating `RollTable.roll({recursive:false})`.
- Official 13.0.0 compendium omissions were observed in two d100 ranges; the generator has minimal fallbacks and reports when it uses one.
- UI is GM-only and creates optional GM-only chat/Journal reward entries.
- Only the active GM should generate awards to avoid concurrent edits.
- Code-level checks target Foundry v14; additional version-specific UI testing is still advised.
