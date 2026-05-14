#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PORT_ROOT=$(cd -- "${SCRIPT_DIR}/.." && pwd)
BUILD_ROOT=${BUILD_ROOT:-"${PORT_ROOT}/build"}
CONFIGURATION=${CONFIGURATION:-RelWithDebInfo}
SCHEME=${SCHEME:-openmw}
APP_NAME=${APP_NAME:-OpenMW-iOS}

: "${TEAM_ID:?Set TEAM_ID to your paid Apple Developer team ID}"
: "${BUNDLE_ID:?Set BUNDLE_ID, for example com.example.openmw}"
: "${OPENMW_SRC:?Set OPENMW_SRC to the patched OpenMW checkout}"
: "${OPENMW_DEPS_PREFIX:?Set OPENMW_DEPS_PREFIX to the iOS dependency install prefix}"

CMAKE_BUILD_DIR="${BUILD_ROOT}/xcode-iphoneos"
ARCHIVE_PATH="${BUILD_ROOT}/${APP_NAME}.xcarchive"
EXPORT_DIR="${BUILD_ROOT}/ipa"
EXPORT_OPTIONS="${BUILD_ROOT}/ExportOptions.plist"

mkdir -p "${CMAKE_BUILD_DIR}" "${EXPORT_DIR}"
sed "s/@TEAM_ID@/${TEAM_ID}/g" "${PORT_ROOT}/apple/ExportOptions.plist.in" > "${EXPORT_OPTIONS}"

cmake -S "${OPENMW_SRC}" -B "${CMAKE_BUILD_DIR}" -G Xcode \
  -DCMAKE_TOOLCHAIN_FILE="${PORT_ROOT}/cmake/iOS-device-toolchain.cmake" \
  -DCMAKE_PREFIX_PATH="${OPENMW_DEPS_PREFIX}" \
  -DOPENMW_IOS_PORT=ON \
  -DBUILD_OPENMW=ON \
  -DBUILD_LAUNCHER=OFF \
  -DBUILD_WIZARD=OFF \
  -DBUILD_OPENCS=OFF \
  -DBUILD_MWINIIMPORTER=OFF \
  -DBUILD_ESSIMPORTER=OFF \
  -DBUILD_BSATOOL=OFF \
  -DBUILD_ESMTOOL=OFF \
  -DBUILD_NIFTEST=OFF \
  -DBUILD_NAVMESHTOOL=OFF \
  -DBUILD_BULLETOBJECTTOOL=OFF \
  -DCMAKE_XCODE_ATTRIBUTE_DEVELOPMENT_TEAM="${TEAM_ID}" \
  -DCMAKE_XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER="${BUNDLE_ID}" \
  -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGN_STYLE=Automatic \
  -DCMAKE_XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS="${PORT_ROOT}/apple/OpenMW-iOS.entitlements"

xcodebuild archive \
  -project "${CMAKE_BUILD_DIR}/OpenMW.xcodeproj" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE_PATH}" \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  PRODUCT_BUNDLE_IDENTIFIER="${BUNDLE_ID}" \
  CODE_SIGN_STYLE=Automatic

xcodebuild -exportArchive \
  -archivePath "${ARCHIVE_PATH}" \
  -exportOptionsPlist "${EXPORT_OPTIONS}" \
  -exportPath "${EXPORT_DIR}"

if [[ -f "${EXPORT_DIR}/${SCHEME}.ipa" && "${SCHEME}" != "${APP_NAME}" ]]; then
  cp "${EXPORT_DIR}/${SCHEME}.ipa" "${EXPORT_DIR}/${APP_NAME}.ipa"
fi

echo "IPA export directory: ${EXPORT_DIR}"
