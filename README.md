# NOT cheats for putt.day

Shot angle, power, ball position, camera heading, tilt and zoom distance for [putt.day](https://putt.day/), with `Z` to return to the previous shot's position and an optional per-object colored edge overlay.
Available as an installable userscript or an unpacked Chrome extension.

[**Install userscript**](https://raw.githubusercontent.com/MaxxKalashnikov/putt-day-notcheats/master/putt-day-notcheats.user.js)

The last shot's angle and power stay visible on a separate line while aiming the next shot, including after undo.
Shot angle and power are displayed to two decimal places.
`Z` undo requires a physical keyboard and is not accessible via touch screen.
Undo restores both the ball position and the game's out-of-bounds return point; it does not rewind the stroke count.
Camera heading uses the same angle convention as shots; tilt is positive when looking down.
Zoom distance is the camera-to-ball distance in game units, not a magnification factor.
It appears once the ball is detected and changes as you scroll or pinch to zoom.

## Edge overlay

| Shortcut | Action |
| --- | --- |
| `E` | Toggle edges, off by default |
| `W` | Switch between creases and full triangle wireframe |
| `X` | Toggle x-ray to show edges through objects |

These shortcuts use the letters on your keyboard layout, not physical QWERTY key positions.
Shortcuts are ignored while typing in editable fields or holding Shift/Command/Control/Option.
Holding a shortcut does not repeatedly toggle it.
The default crease mode shows open boundaries and edges where faces meet at an angle of at least 15 degrees.
Mode and x-ray choices apply when you next enable edges, and reset on page reload.
For a different crease threshold, run `window.__edges.setAngle(30)` in the browser console.
Disable any standalone copy of the edge userscript before using this version.

The edge overlay is adapted from **Thea**'s `three.js polygon/object edges` v1.1, shared in these Discord posts:
[original post](https://discord.com/channels/1516982740975882350/1516982741466353817/1552671332486094909) and [related post](https://discord.com/channels/1516982740975882350/1516982741466353817/1552670961290182757).

## Browser setup

### Chrome and derivatives

1. Install Tampermonkey from the [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo).
2. Enter `chrome://extensions` in the address bar.
3. Find Tampermonkey and click **Details**.
4. Enable **Allow User Scripts**. Installing the extension alone does not enable this permission.
5. Under **Site access**, make sure Tampermonkey can access `https://putt.day/` and `raw.githubusercontent.com`, which serves installations and updates.

Chrome 138 and newer use the per-extension **Allow User Scripts** switch.
Older Chrome versions use the **Developer mode** switch at the top of `chrome://extensions` instead.
See [Tampermonkey's permission guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209) for screenshots.

### Firefox and derivatives

1. Install Tampermonkey from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) and approve its requested permissions, including website access.
2. Enter `about:addons` in the address bar, open **Extensions**, and make sure Tampermonkey is enabled.
3. Open Tampermonkey's entry and check **Permissions** if website access has been restricted. It needs access to `https://putt.day/` and `raw.githubusercontent.com` for installation and updates.
4. If Tampermonkey requests an additional permission to run userscripts, approve the prompt.

Firefox does not require Chrome's **Allow User Scripts** switch or **Developer mode**.
If you use a private window, also set **Run in Private Windows** to **Allow** in Tampermonkey's extension details.

### Safari with Userscripts

1. Install [Userscripts from the App Store](https://apps.apple.com/app/userscripts/id1463298887).
2. Open the Userscripts app and confirm or select its script directory.
3. Enable Userscripts in Safari's extension settings.
4. Allow Userscripts access to `putt.day` and `raw.githubusercontent.com` for execution, installation and updates.

See the [Userscripts documentation](https://github.com/quoid/userscripts#usage) for directory and permission help.

### Install and verify

In Chrome or Firefox, click the **Install userscript** link above and confirm the installation in Tampermonkey.

In Safari, open the same link.
Seeing JavaScript text is normal.
Open the Userscripts extension popup from Safari's toolbar or page menu, then select the installation prompt and confirm.
If the install prompt does not appear, save `putt-day-notcheats.user.js` in the script directory configured in Userscripts.

Make sure both the userscript manager and the script are enabled, then fully reload [putt.day](https://putt.day/).
Open a hole and check for position, angle and power text, then try `Z` after taking a shot.
Rotate and zoom the camera to check that heading, tilt and zoom distance update.

## Turn it on or off

Userscripts and Tampermonkey already have per-script toggles.
On putt.day, open the manager's popup and toggle **NOT cheats for putt.day**; Tampermonkey also has a switch in its dashboard.
Then fully reload the game page, not just restart the hole.
The script intercepts WebAssembly initialization, so toggling does not undo patches in an already loaded page.

Do not enable the Chrome extension and the userscript at the same time.
They would patch the same game code twice.

## Load as a Chrome extension

The unpacked extension still works from this repository with the same script file.
Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this directory.
Disable any installed userscript copy first, then reload putt.day.

## Updates and publishing

Install from the raw link above to configure updates.
In Safari Userscripts, use the popup's available-updates view to apply updates; in Tampermonkey, enable automatic update checks or check manually in its dashboard.
Reload putt.day after updating.

To publish an update, increase `@version` in `putt-day-notcheats.user.js`, keep `manifest.json`'s version in sync, and publish the files on the repository's `master` branch.
The Install link works only after that file is published on `master`.
Keep `@updateURL` and `@downloadURL` pointing to the stable raw file URL, not a commit hash.
Keep the script self-contained, with `document-start` and page-world injection; delayed or isolated execution misses the game's WebAssembly initialization.
The manifest and userscript use the same source, with no build step or runtime downloads.
