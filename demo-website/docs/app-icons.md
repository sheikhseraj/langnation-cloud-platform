# LangNation School installation icons

Dark is the default Android/PWA and iOS home-screen artwork. White is the second asset option. Originals are in brand/app-icons; run npm run icons:app to regenerate. npm run icons and brand activation preserve these installation icons separately from header branding.

The generator replaces only edge-connected black corner pixels with the matching background, preserves the supplied artwork, and emits opaque square PNGs. Platforms apply the final rounded shape. Android maskable images keep the entire design inside the safe circle.

Default files: public/icons/icon-192.png, icon-512.png, icon-1024.png, icon-maskable-512.png, and apple-touch-icon.png (180px), plus iOS sizes 120, 152 and 167.

White alternatives: icon-white-192.png, icon-white-512.png, icon-white-1024.png, icon-maskable-white-512.png, apple-touch-icon-white.png, and the additional iOS sizes.

The website manifest selects dark explicitly; white files are retained for alternate app packaging. A website/PWA cannot provide native iOS or Android launcher icon switching. Native app packages must implement that option separately.

Manifest icon URLs are content-versioned to refresh installed PWA metadata. The service worker cache was bumped; iOS home-screen icons may require removing and adding the shortcut again. Existing signed Android/iOS store apps need a rebuilt package to update their embedded launcher icons.
