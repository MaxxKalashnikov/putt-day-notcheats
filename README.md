# NOT cheats for putt.day

Angle, power and ball-position indicators for [putt.day](https://putt.day/), with `Z` to return to the previous shot's position.
Available as an installable userscript or an unpacked Chrome extension.

[**Install userscript**](https://raw.githubusercontent.com/MaxxKalashnikov/putt-day-notcheats/master/putt-day-notcheats.user.js)

`Z` undo requires a physical keyboard and is not accessible via touch screen.

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
