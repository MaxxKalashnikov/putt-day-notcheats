# NOT cheats for putt.day

Practice-only shot angle, power, ball position, camera heading, tilt and relative zoom for [putt.day](https://putt.day/), with `Z` to return to the previous shot's position and an optional per-object colored edge overlay.
Available as an installable userscript or an unpacked Chrome extension.

[**Install userscript**](https://raw.githubusercontent.com/MaxxKalashnikov/putt-day-notcheats/master/putt-day-notcheats.user.js)

The last shot's angle and power stay visible on a separate line while aiming the next shot, including after undo.
The top-row number follows the game's stroke counter, including after undo and restart.
Shot angle and power are displayed to two decimal places.
`Z` undo requires a physical keyboard and is not accessible via touch screen.
Undo restores both the ball position and the game's out-of-bounds return point; it does not rewind the stroke count.
Camera heading uses the same angle convention as shots; tilt is positive when looking down.
Relative zoom is `4.4 / camera-to-ball distance`: `1.00×` at the default distance of 4.4 game units, `2.20×` at distance 2, and `0.37×` at distance 12.
It appears once the ball is detected and changes as you scroll or pinch to zoom.

## Practice only

Loading the script makes every run practice-only, even if you never use an assist.
A **Practice** badge beside the score counter identifies assisted runs.
Its tooltip says that scores are disabled.
Sinking the ball keeps it in the cup and opens a dialog saying "Now do it without assists ;)" instead of recording a result.
Choose **Keep looking** to dismiss the dialog or **Practice again** to restart.
Undo is disabled once the ball is holed.
For a normal run, disable the script in your userscript manager or extension settings and fully reload the page.
Restarting a hole does not turn practice mode off.

The script removes results before game-state subscribers can see them.
Separate guards hide native result overlays, reject local score writes and score/replay uploads, and drop multiplayer finish messages.
Existing saved scores are not erased, but score syncing and replay creation are restricted while the script is loaded.
Disable the script and reload before syncing scores or sharing saved replays.
Do not use it in multiplayer, where blocked finish messages can leave other players waiting.
If the completion guard cannot be installed, the script refuses to start the game's assisted physics.

These guards target the current game implementation and may need updates when putt.day changes.
They prevent completion with the unmodified script, not deliberate removal of its restrictions or repeating practiced shots without assists.

## Numeric shots

The HUD's **aim:** row contains editable angle (°) and power (%) fields.
Enter an angle from 0 to 360 and power from 0.1 to 100, then press **Enter** or **Space** in either field to shoot.
Numeric shooting requires a keyboard.
Enter and Space also shoot when neither field is focused, without intercepting other editable controls, buttons or links.
Outside the controls, these shooting shortcuts ignore key repeats and Shift/Command/Control/Option modifiers.
Angle and power accept hundredths and display two decimal places with leading zeros, such as `005.00`, so hundreds and tens remain selectable even for small values.
Focusing or editing the numeric controls shows the game's normal power-and-direction indicator while the ball is ready.
Typing and arrow shortcuts update the preview without taking a shot.
The preview stays visible while rotating or zooming the camera, including camera switches with `T`.
It clears when you interact with other UI controls, enter invalid values, shoot, undo, restart or grab the ball for mouse aiming.
While a field is focused, **←/→** select a digit, skipping the decimal point, and **↓/↑** decrease/increase its place value with normal carrying and borrowing.
Moving right past the last digit selects the other field's first digit; moving left past the first selects the other field's last digit.
When neither field is focused, **←/→** decrease/increase angle by 1° and **↓/↑** decrease/increase power by 1 percentage point.
Holding an arrow key repeats the adjustment; values stop at their limits.
Power adjustments can reach `000.00` as a starting point, but shooting requires at least 0.1% power.
Arrow shortcuts are ignored in other editable controls and while holding Shift/Command/Control/Option.
The fields use text inputs for digit selection, with decimal keyboards on mobile and validation of the ranges above.
Angles use world coordinates: 0° points toward +X, 90° toward −Z, 180° toward −X, and 270° toward +Z, regardless of the camera.
Numeric shots use the game's normal firing path, including stroke counting, spin and ready-to-shoot checks.
Mouse aiming and manual shots automatically fill the fields with the shot's angle (rounded to 0.01°) and power (rounded to 0.01%).
Numeric shots and undo keep the entered values so you can fine-tune and shoot again.
`R`, `Z`, `T`, `E` and `W` run their game or overlay shortcuts even while the numeric controls are focused, without inserting letters or moving focus.
Enter, Space and these letter shortcuts ignore key repeats and Shift/Command/Control/Option modifiers in the numeric controls; Ctrl/Cmd+Z remains available for editing.
Mouse aiming continues to work normally.
The controls reuse the game's loaded runtime module; game updates that change its structure may require a userscript update.
Values reset on page reload.

## Edge overlay

| Shortcut | Action |
| --- | --- |
| `E` | Toggle edges, off by default |
| `W` | Switch between creases and full triangle wireframe |
| `X` | Toggle x-ray to show edges through objects |

These shortcuts use the letters on your keyboard layout, not physical QWERTY key positions.
Shortcuts are ignored while typing in editable fields, except that `E` and `W` also work in the numeric shot controls.
They are ignored while holding Shift/Command/Control/Option.
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
Rotate and zoom the camera to check that heading, tilt and relative zoom update.

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
