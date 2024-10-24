/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "VibrancyManager.h"
#include "ViewRegion.h"
#include "nsRegion.h"
#include "ViewRegion.h"

#import <objc/message.h>

#include "nsChildView.h"
#include "SDKDeclarations.h"
#include "mozilla/StaticPrefs_widget.h"

using namespace mozilla;

#if !defined(MAC_OS_X_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_12
@interface NSVisualEffectView (NSVisualEffectViewMethods)
- (void)setEmphasized:(BOOL)emphasized;
@end
#endif

@interface MOZVibrantView : NSVisualEffectView {
  VibrancyType mType;
}

- (instancetype)initWithFrame:(NSRect)aRect
                 vibrancyType:(VibrancyType)aVibrancyType;
@end

@interface MOZVibrantLeafView : MOZVibrantView
@end

static NSVisualEffectState VisualEffectStateForVibrancyType(
    VibrancyType aType) {
  switch (aType) {
    case VibrancyType::Titlebar:
      break;
    case VibrancyType::Sidebar:
      break;
  }
  return NSVisualEffectStateFollowsWindowActiveState;
}

static NSVisualEffectMaterial VisualEffectMaterialForVibrancyType(
    VibrancyType aType) {
  switch (aType) {
    case VibrancyType::Sidebar:
      return NSVisualEffectMaterialSidebar;
   case VibrancyType::Titlebar:
      return NSVisualEffectMaterialTitlebar;
  }
}

static NSVisualEffectBlendingMode VisualEffectBlendingModeForVibrancyType(
    VibrancyType aType) {
  switch (aType) {
  case VibrancyType::Sidebar:
      return StaticPrefs::widget_macos_sidebar_blend_mode_behind_window()
                 ? NSVisualEffectBlendingModeBehindWindow
                 : NSVisualEffectBlendingModeWithinWindow;
  case VibrancyType::Titlebar:
      return StaticPrefs::widget_macos_titlebar_blend_mode_behind_window()
                 ? NSVisualEffectBlendingModeBehindWindow
                 : NSVisualEffectBlendingModeWithinWindow;  
  }
}

@implementation MOZVibrantView
- (instancetype)initWithFrame:(NSRect)aRect vibrancyType:(VibrancyType)aType {
  self = [super initWithFrame:aRect];
  mType = aType;

  self.appearance = nil;
  self.state = VisualEffectStateForVibrancyType(mType);
  self.material = VisualEffectMaterialForVibrancyType(mType);
  self.blendingMode = VisualEffectBlendingModeForVibrancyType(mType);
  self.emphasized = NO;
  return self;
}
@end

@implementation MOZVibrantLeafView

- (NSView*)hitTest:(NSPoint)aPoint {
  // This view must be transparent to mouse events.
  return nil;
}

// MOZVibrantLeafView does not have subviews, so we can return YES here without
// having unintended effects on other contents of the window.
- (BOOL)allowsVibrancy {
  return NO;
}

@end


VibrancyManager::VibrancyManager(const nsChildView& aCoordinateConverter,
                                 NSView* aContainerView)
    : mCoordinateConverter(aCoordinateConverter),
      mContainerView(aContainerView) {}

VibrancyManager::~VibrancyManager() = default;

bool VibrancyManager::UpdateVibrantRegion(
    VibrancyType aType, const LayoutDeviceIntRegion& aRegion) {
  auto& slot = mVibrantRegions[aType];
  if (aRegion.IsEmpty()) {
    bool hadRegion = !!slot;
    slot = nullptr;
    return hadRegion;
  }
  if (!slot) {
    slot = MakeUnique<ViewRegion>();
  }
  return slot->UpdateRegion(aRegion, mCoordinateConverter, mContainerView, ^() {
    return [[MOZVibrantView alloc] initWithFrame:NSZeroRect vibrancyType:aType];
  });
}

/* static */ NSView* VibrancyManager::CreateEffectView(VibrancyType aType, BOOL aIsContainer) {
  return aIsContainer ? [[MOZVibrantView alloc] initWithFrame:NSZeroRect vibrancyType:aType]
                      : [[MOZVibrantLeafView alloc] initWithFrame:NSZeroRect vibrancyType:aType];

}

static bool ComputeSystemSupportsVibrancy() {
#ifdef __x86_64__
  return NSClassFromString(@"NSAppearance") && NSClassFromString(@"NSVisualEffectView");
#else
  // objc_allocateClassPair doesn't work in 32 bit mode, so turn off vibrancy.
  return false;
#endif
}

/* static */ bool VibrancyManager::SystemSupportsVibrancy() {
  static bool supportsVibrancy = ComputeSystemSupportsVibrancy();
  return supportsVibrancy;
}

