# OpenMW iOS sideload port kit

This directory contains a reproducible starting point for producing a sideloadable
OpenMW `.ipa` for a paid Apple Developer account. It does **not** include any
Bethesda game assets; install your legally owned `Data Files` after first launch
through Finder file sharing, Files.app, or an app-group/container copy workflow.

OpenMW does not publish an official iOS target. This port kit keeps the changes
outside the upstream tree as much as possible:

1. fetch OpenMW from GitLab (or the GitHub mirror if GitLab is unavailable),
2. apply the iOS bootstrap patch in `patches/openmw-ios-bootstrap.patch`,
3. configure OpenMW for an iOS device-only Xcode build,
4. archive and export an ad-hoc/development signed `.ipa` using your team ID.

## Host requirements

* macOS with Xcode command line tools and an installed iOS SDK.
* CMake 3.24 or newer and Ninja available on `PATH`.
* A paid Apple Developer account with a development team ID.
* An iOS-compatible static dependency prefix for OpenMW dependencies.

The dependency prefix is intentionally external because the heavy work is
building SDL2, OpenSceneGraph (GLES/gl4es configuration), MyGUI, Bullet, FFmpeg,
OpenAL Soft, Boost, LZ4, ICU, yaml-cpp, SQLite, RecastNavigation, and related
libraries for `iphoneos`. Put the resulting CMake package files and static
libraries under one prefix and pass it as `OPENMW_DEPS_PREFIX`.

## Quick start

```bash
cd ports/openmw-ios

# 1. Fetch upstream and apply the iOS patch.
./scripts/bootstrap-openmw-ios.sh /tmp/openmw-ios-src

# 2. Build and export an IPA for a physical device.
TEAM_ID=ABCDE12345 \
BUNDLE_ID=com.example.openmw \
OPENMW_SRC=/tmp/openmw-ios-src \
OPENMW_DEPS_PREFIX=/opt/openmw-ios-deps/iphoneos \
./scripts/build-ipa.sh
```

The exported IPA will be written to `ports/openmw-ios/build/ipa/OpenMW-iOS.ipa`
by default. Install it with Xcode Devices and Simulators, Apple Configurator, or
another sideload tool that can use your paid developer provisioning profile.

## Runtime data layout

The generated app expects user-provided content in the app container, for
example:

```text
Documents/OpenMW/Data Files/Morrowind.esm
Documents/OpenMW/Data Files/Tribunal.esm
Documents/OpenMW/Data Files/Bloodmoon.esm
Documents/OpenMW/openmw.cfg
```

A minimal `openmw.cfg` should point at the copied data and content files:

```ini
data="/var/mobile/Containers/Data/Application/<UUID>/Documents/OpenMW/Data Files"
content=Morrowind.esm
content=Tribunal.esm
content=Bloodmoon.esm
```

The UUID changes per install, so keep `openmw.cfg` in the app container and
update paths after reinstalling until a native in-app file picker is added.

## Current porting constraints

* iOS has no desktop OpenGL. Dependencies must be built for OpenGL ES via OSG's
  GLES path and/or a gl4es bridge.
* Launcher, wizard, OpenCS, and Qt tools are disabled. This is an engine-only IPA.
* JIT is not required by OpenMW, which makes paid-account sideloading practical.
* Morrowind assets are not redistributed by this repository or the generated IPA.
