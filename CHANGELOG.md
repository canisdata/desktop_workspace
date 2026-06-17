# Changelog

All notable changes to the Desktop app are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## 0.10.2 – 2026-06-16

### Fixed
- **The window title icon no longer gets “picked up” as an image** while dragging a window — it’s
  now non-draggable, so only the window moves.
- **File viewer (.txt/.md and others) keeps its title bar (modal header) and scrolls.** The
  dedicated viewer page now lays the Nextcloud viewer modal out as a header plus a scrollable
  content area, matching how it looks inside the full Files app.
- **“Set status” in the user menu** now opens the Nextcloud status overlay (like global search)
  instead of opening the desktop in a window — the user-status trigger is no longer captured as a
  window link.

### Changed
- The taskbar **date/time uses the same font as window titles** and is vertically centred.

## 0.10.1 – 2026-06-16

### Fixed
- **Windows can be dragged from the title and app icon too**, not just the empty part of the title
  bar; the grab/grabbing cursor now shows across the whole bar.
- **Apps restore at their last location after a browser reload.** Registered apps (Desktop Files,
  Nextcloud Files, etc.) reopened at the URL they were first opened with; they now reopen at the
  last URL the window was on. (Desktop Files’ folder is tracked via its in-app reports rather than
  the static iframe URL.)
- **Paste in the desktop right-click menu** only appears when there is actually something on the
  clipboard; a leftover clipboard from a previous session is cleared on load.

### Changed
- **Personal settings apply immediately** — the Save button is gone; toggling an option or picking
  a desktop folder takes effect right away (and live in the running desktop).

## 0.10.0 – 2026-06-16

### Fixed
- **Opening .txt/.md (and other files) from the desktop** no longer hangs on “Opening with the
  native Nextcloud viewer…”. The desktop now passes an absolute file path to the viewer, exactly
  like Desktop Files does.
- **The “+ New” menu in Desktop Files** is now a proper dropdown (it was always expanded because a
  CSS rule overrode the `hidden` attribute).

### Added
- **Drag-and-drop upload from your computer** onto the desktop uploads into the desktop folder,
  with a progress bar.
- **Full reset (user):** “Reset all desktop settings” clears every desktop setting, as if the
  desktop had never been opened.
- **Full reset (admin):** an admin can reset one user at a time from the admin settings (type or
  pick a user id), wiping that user’s desktop settings completely.
- **First-visit onboarding:** the very first time a user opens the desktop (and again after a full
  reset) their desktop settings open automatically.

### Changed
- **Personal settings reorganised** into Desktop icons → Desktop folder → Wallpaper → Experimental
  → Reset, with a **single Save button** and an **unsaved-changes reminder**. The folder picker now
  stages its choice and is applied on Save. A **Change wallpaper** button links to Nextcloud’s
  appearance settings in the same window.
- Wider desktop icon labels (about two more characters before wrapping); the icon image is
  unchanged.

## 0.9.0 – 2026-06-16

### Fixed
- **Iframe windows restore where you left them.** A window that browsed to another folder or opened
  a file (in the native Files app or in Desktop Files) now restores at that last location instead of
  the URL it was first opened with. In-iframe navigation is tracked even when the app routes
  client-side, and Desktop Files’ current folder is mirrored into the saved state.

### Added
- **Desktop right-click menu.** Right-clicking empty desktop space now offers: **New folder**
  (created in your desktop folder and shown immediately, no reload), **Paste** (when applicable),
  **Desktop Settings**, and — for administrators — **Desktop Admin Settings**.
- **Live desktop updates from Desktop Files.** Creating, uploading, moving, pasting, renaming or
  deleting in Desktop Files now refreshes the desktop immediately, so anything that lands in the
  desktop folder appears as an icon right away.
- **“+ New” menu in Desktop Files**, between the folder-content label and the clipboard bar, with
  **New folder**, **New text file** and **Upload files** (WebDAV `MKCOL`/`PUT`).
- **Settings apply live.** Saving desktop settings from the in-desktop settings window now applies
  to the running desktop immediately (favorites, desktop folder, Recycling Bin/Home toggles,
  confirmation options) without a reload. Theme/appearance changes already propagate via the
  desktop’s periodic appearance sync.

## 0.8.0 – 2026-06-16

### Added
- **Open windows persist per user.** A window’s size, position, stacking order and
  minimized/maximized state are now saved to your account (like desktop icon positions) and
  restored on your next visit, on any device. This replaces the previous per-browser
  (localStorage) persistence.
- **Stale windows are dropped on restore.** When the desktop reloads, a window is *not* restored if
  its app has been removed or disabled, or if the file/folder it was showing no longer exists. The
  pruned set is saved back so it stays clean.
- **“Reset open windows”** button in personal settings: closes all windows and clears their saved
  state (alongside the existing “Reset desktop icon positions”).

## 0.7.2 – 2026-06-16

### Changed
- **Desktop folder and favorites are now shown together.** When a desktop folder is set, the
  desktop shows the folder’s contents *and* your favorites (favorites are linked on the desktop,
  as before). An item that is both a folder member and a favorite appears only once, deduplicated
  by file id.
- **Favorites are always marked with a star**, independent of whether a desktop folder is set or
  which file manager is the default.

## 0.7.1 – 2026-06-16

### Fixed
- **Group folders and external storage can no longer be chosen as the desktop folder.** The
  ownership check now requires the folder to live on your own home storage, which also rejects
  group folders and external mounts (in addition to folders shared with you).
- **Favorite stars now actually appear.** Favorited items get the star marker both in
  desktop-folder mode and in the plain favorites view, regardless of which file manager is the
  default. (The star previously never rendered: favorites loaded as icons weren’t flagged as
  favorites, and the badge used a colour value that isn’t valid as an SVG attribute.)

### Added
- **Clipboard works across the desktop and the Desktop File Manager.** Cut or copy on the desktop
  and paste inside Desktop Files — or the other way round. The clipboard is shared between them, and
  the Desktop Files paste button reflects what was copied on the desktop. (Available when the
  Desktop File Manager is enabled.)
- **Drag and drop between the desktop and Desktop Files.** Drag a file from a Desktop Files window
  onto the desktop to move it into your desktop folder, or drag a desktop icon onto a Desktop Files
  window to move it into that window’s current folder. Both views refresh afterwards.

## 0.7.0 – 2026-06-16

### Added
- **Desktop folder.** In personal settings you can now pick one of your **own** folders and have
  its contents shown on the desktop as icons. Only folders you own are accepted — folders shared
  with you (and external storages) are rejected server-side with a clear message. Leave it empty
  to keep the previous favorites-as-icons behaviour.
- **Favorite markers.** When a desktop folder is set and favorites are enabled, items in that
  folder that are favorites are marked with a star badge, the way Nextcloud Files shows favorites.
- **Right-click file operations** on desktop-folder items: Open, Download, Rename, Add/Remove
  favorite, and **Move to deleted files**. Cut / Copy / Paste are available **only when the
  experimental Desktop File Manager is enabled**; paste targets the desktop folder, and an empty
  spot on the desktop offers Paste as well.
- **Drag onto the Recycling Bin** to delete. Dropping an icon on the Bin moves it to deleted
  files, with a confirmation dialog and a “Don’t ask again” option (also a checkbox in personal
  settings, mirroring the favorites behaviour). The Bin highlights while you drag over it.

### Changed
- Removed the light overlay (“haze”) that sat over the wallpaper in light themes — the wallpaper
  is now shown exactly as provided.

### Notes
- **Deletions always go through the Recycling Bin.** Every delete here is a plain WebDAV `DELETE`
  on the files endpoint, which moves the item to *Deleted files*; nothing is ever permanently
  removed by the desktop. Restore from the Recycling Bin as usual.
- The folder picker uses the standard Nextcloud file dialog restricted to folders. Ownership is
  validated on the server when you save, so a shared folder chosen by mistake is refused.

## 0.6.3 – 2026-06-16

### Changed
- **Design-guideline pass** over everything added since 0.1.11. Aligned the desktop icons,
  context menu, confirmation dialog, group multiselect, multi-window cards, usage-stats table
  and file thumbnails to the official Nextcloud design tokens: `--border-radius-element/-small/
  -container/-pill`, `--default-clickable-area` (34px min for menu items, options and buttons),
  `--default-font-size`/`--font-size-small`, `--color-box-shadow`, and the primary/border/hover
  color variables (replacing hardcoded radii, sizes and the legacy `--border-radius-large`).
- The **Recycling Bin** icon now uses an inline **Material Design** icon instead of the
  `core/img` delete icon (deprecated since NC 25). The white tile for Home and Bin is kept.

### Notes
- The full-screen shell chrome (windows, taskbar, start menu) keeps its own visual identity by
  design; the guideline’s nav→content app layout does not apply to it. The right-click menu
  follows Nextcloud’s popover *styling* conventions rather than the three-dot `popovermenu`
  markup, since it opens at the cursor rather than from a three-dot trigger.

## 0.6.2 – 2026-06-16

### Fixed
- Desktop icon labels get a **white shadow under light themes** (where the text is dark) and
  keep the black shadow under dark themes, so labels stay readable on any wallpaper.
- **Icons can no longer end up behind the taskbar.** Placement and drops are constrained to
  the space above the taskbar. When the window/stage shrinks, overflowing icons reflow upward
  within the grid, and return to their saved positions once there is room again — unless one of
  the reflowed icons is moved, in which case its new position is saved.

## 0.6.1 – 2026-06-16

### Changed
- **Desktop icon positions now persist in the user profile** (server-side) instead of per
  browser, so they follow the user to other machines. Saved (debounced) whenever icons move.

### Added
- Personal settings button **"Reset desktop icon positions"** that clears the stored layout
  and returns to the standard arrangement.

## 0.6.0 – 2026-06-16

### Added
- **Admin: multiple windows per app.** A "Multiple windows" section in Desktop Environment
  lets admins pick (in a card grid) which apps users may open in more than one window. File
  managers always allow multiple windows.
- **Admin: usage statistics.** Shows instances in use right now, unique users per day (last 7
  days) and per week (last 4 weeks). Counts only — it records *how many* users use Desktop,
  never *who*; a user who opens Desktop many times in a day counts once for that day.

### Changed
- Recycling Bin now opens the **trashbin** view (`/apps/files/trashbin`) instead of the home
  folder, and uses the dark bin icon so it is visible on its light tile.
- The **Home** folder icon now takes the first grid cell; other icons flow after it.
- Personal settings now state clearly that **favorites are links**, not copies — removing a
  favorite icon never deletes the file or folder.

## 0.5.0 – 2026-06-16

### Added
- **Show Recycling Bin** (personal setting): a Recycling Bin desktop icon, placed right after
  the favorites. Opens deleted files in the Nextcloud file manager. Movable like favorites.
- **Show Home Folder** (personal setting): a "Home" folder icon on the desktop that opens the
  user's root folder in their default file manager.
- **Multi-select on the desktop:** drag a rubber-band rectangle on empty desktop to select
  several icons, and Ctrl/Cmd-click to toggle individual icons. Right-click acts on the whole
  selection, and selected icons can be dragged and re-gridded together.

### Changed
- The "Try out Desktop File Manager" personal option is now hidden when the admin has disabled
  it for everyone — unless the user is in an allowed test group. (When the admin disables it
  after a user opted in, that user is already served Nextcloud Files automatically.)
- Removed the Reload-desktop button for now.

## 0.4.2 – 2026-06-16

### Fixed
- **Reload desktop** now also applies Nextcloud appearance/theme changes (re-syncs stylesheets
  and theming styles) and the changed **preferred file manager** — the apps menu and favorite
  folder opening switch between Files and Desktop Files without a page reload.
- Reload button is now vertically centred in the header bar.
- Favorite **folders** opened in Desktop Files now show their path and use the app title
  ("Desktop Files" / "Files") as the window title — the file manager now reports its path to
  the correct window (also fixes meta for multiple Desktop Files windows).
- Favorite **files** now open exactly as they do inside Desktop Files (the viewer), regardless
  of whether the Desktop file manager is enabled — instead of just opening a file manager.

## 0.4.1 – 2026-06-16

### Fixed
- Clicking a tiled/snapped window's titlebar now just focuses it. It only leaves the tile and
  returns to its previous size once you actually drag it.

### Changed
- Favorites open in the user's default file manager: **Desktop Files** when that's enabled,
  otherwise **Nextcloud Files** (Desktop Files now accepts an initial `?dir=`).
- Multiple windows from the apps menu are now limited to the **file managers** (Desktop Files
  / Nextcloud Files). All other apps open a single window again.

### Added
- **Reload desktop** button (circle-arrow, right of unified search) — refreshes the desktop
  favorites and reloads stylesheets to pick up appearance changes. It does **not** reload the
  page or any open windows or their contents.
- Removed the header contacts menu from the taskbar (the Contacts app remains available).

## 0.4.0 – 2026-06-16

### Added
- **Show Favorites on Desktop** (personal setting). Nextcloud favorites render as desktop
  icons (same previews/mimetype icons as Files), freely arrangeable in a non-overlapping grid
  with positions remembered. Drag to rearrange (snaps to the nearest free cell),
  double-click to open, right-click for a menu.
- **Remove from favorites** from the icon's right-click menu, with a confirmation dialog and a
  "Don't ask again" option. The same preference is available in personal settings
  ("Don't ask for confirmation before removing a favorite").
- **Window resizing** by dragging any side or corner (8 handles, with minimum size and stage
  clamping).
- **Window snapping / tiling** (Windows-style): drag a window's titlebar to the left/right
  edge to tile 50%, to a corner for a 25% quarter, to the top-middle to maximize. A live
  preview shows the target; dragging a tiled window restores its floating size.

### Changed
- Apps opened from the apps menu now allow **multiple windows** of the same app
  (as Desktop Files already did).

## 0.3.1 – 2026-06-16

### Added
- Taskbar **fullscreen toggle** (left of the apps menu), tooltip "Toggle fullscreen".
- Credit (bottom right) now also shows "Proof of Concept – may contain errors" and the
  running **Nextcloud server version**.

### Changed
- Removed the wallpaper heading/intro text from the stage.
- **"Open Nextcloud"** logo now opens Nextcloud in a **new browser tab**.
- **Desktop Files** uses the **same icons/previews as Nextcloud Files** (preview thumbnails
  where available, mimetype icons otherwise).
- **Admin group allow-list fixed:** the group list is now the *testing exception* — editable
  only while the file manager is disabled for everyone, greyed out when it is enabled for
  everyone. Presented as a Nextcloud-style searchable token dropdown.

## 0.3.0 – 2026-06-15

### Added
- **Desktop settings.** A personal settings page ("Desktop") with an opt-in checkbox
  "Try out Desktop File Manager – Experimental". By default, Nextcloud Files stays the
  standard file manager; the Desktop file manager is opt-in.
- **Admin category "Desktop Environment"** with: "Disable experimental Desktop File Manager
  for everyone", a group allow-list that greys out when disabled, and the debug-log toggle
  (moved here, behaviour unchanged).
- Cogwheel in the apps menu (right of the search box) that opens the user's Desktop settings;
  tooltip "Desktop Settings".

### Changed
- The Desktop file manager now only appears for users who are allowed (not globally disabled,
  in an allowed group if a list is set) and have opted in. Everyone else uses Nextcloud Files.

## 0.2.5 – 2026-06-15

### Added
- Wallpaper credit (bottom-right): "Desktop by canisdata.de" and the live app version.

### Changed
- Window dragging bounds: a window may now move off-frame to the left (stopping while the
  reload button stays ~one cursor-width from the edge), is limited on the right to the app
  icon, and its titlebar can no longer move below the taskbar. The app icon and name are no
  longer a drag handle and show the default cursor.

### Fixed
- Files icon paths no longer hardcode `/custom_apps/…`; they resolve via `OC.imagePath`, so
  the app works whether it is installed under `apps/` or `custom_apps/`.

## 0.2.4 – 2026-06-15

### Fixed
- Account-menu items now reliably open in their own desktop windows. The account menu
  (NcListItem inside an NcPopover) detaches the anchor on pointerdown, swallowing the click,
  so interception now happens on pointerdown; the click handler suppresses native navigation.
  Opens are de-duplicated by window id.

## 0.2.3 – 2026-06-15

### Added
- Sidebar info (ⓘ) trigger at the end of each row opens the details sidebar; an X in the
  sidebar header closes it. Selecting a file no longer auto-opens the sidebar.
- Sharing in the sidebar: an internal link (`/f/<id>`) for people who already have access,
  plus user/group/team sharing backed by the OCS sharees search.
- Resizable tree column (the current width is the minimum).
- Per-window reload button (left of minimize, divider, "Refresh content").

### Changed
- Toolbar is a grid mirroring the main columns, so "Tree View" / "Folder content" align with
  their columns and the clipboard sits beside them.

### Fixed
- Header-menu items open in windows (first iteration).
- Contacts-menu avatar no longer grows in width (was wrongly matched by the menu positioner).
- Dark logo in light mode: the taskbar logo (cloned from the dark header) now gets a
  brightness-aware contrast filter, re-applied on appearance changes.

## 0.2.2 – 2026-06-15

### Added
- Multi-select in the file list: Shift-click for a contiguous range, Ctrl/Cmd-click for a
  disparate selection.
- Copy / Cut / Paste via server-side WebDAV COPY / MOVE.
- Name-collision dialog (Keep both / Overwrite / Skip / Cancel) with an "apply to all"
  option scoped to the operation. Rename inserts the next free integer before the extension
  and is compound-extension aware (e.g. `archive.tar.gz` → `archive_1.tar.gz`).
- Confirmation before a cut/paste (move), none before copy/paste.

## 0.2.1 – 2026-06-15

### Changed
- **Merged the `desktopfiles` app into `desktop`** as a self-contained `files` module
  (`templates/files/`, `js/files/`, `css/files/`, `lib/Controller/FilesController`). The app
  is now a single store-publishable folder.
- Toolbar relabelled: Up / Refresh / Open-in-Files as glyphs/icon with tooltips; "Tree View"
  and "Folder content" labels; in-toolbar title removed (the window titlebar already shows it).
- h1 changed from "Nextcloud Desktop" to "Desktop in Nextcloud".

### Added
- Makefile that builds a single-top-level-folder, store-ready tarball and signs it when a
  certificate is present.
- Translations merged into the `desktop` namespace (de / en / fr).

### Removed
- Dead/duplicate assets: superseded shell scripts (`-release`, `-headerfix`, `-menualign`),
  `viewer2`–`viewer9` duplicates, and dev/release twins that were byte-identical.
