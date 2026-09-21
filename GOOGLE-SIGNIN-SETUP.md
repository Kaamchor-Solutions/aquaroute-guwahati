# Turning on Sign in with Google

Ten minutes, once. It is free and it does **not** need a credit card. That is the
difference between Google Sign-In and Google Maps: Maps requires a billing account before
it will give you a working key, sign-in does not.

Until you do this, the app simply does not show a Google button. Nothing is broken and
email sign-in keeps working, so there is no rush.

---

## 1. Make a project

Go to **console.cloud.google.com**. Sign in with the Google account you want to own this.

Top left, next to the Google Cloud logo, there is a project dropdown. Click it, then
**New Project**. Call it `AquaRoute` and press Create. Wait a few seconds and make sure
the dropdown now says AquaRoute.

You will not be asked for a card. If something ever does ask you for one, you have
wandered into Maps or another paid product. Back out.

## 2. Fill in the consent screen

In the search bar at the top, type **Google Auth Platform** and open it. If it offers to
get you started, say yes.

It asks for:

- **App name**: AquaRoute Guwahati. This is what people see on the sign-in popup, so use
  a name they will recognise.
- **User support email**: your own address.
- **Audience**: choose **External**. Internal only exists for Google Workspace
  organisations and would lock everybody else out.
- **Contact information**: your own address again.

Agree to the policy and finish.

While the app is in **Testing** only accounts you list can sign in. For a workshop that is
usually what you want: add your own address and any demo accounts under **Audience**,
**Test users**. When you are ready for anyone to use it, come back and press **Publish
app**. A plain email and profile sign-in like this one does not need Google's verification
review.

## 3. Create the client ID

In the left menu choose **Clients**, then **Create client**.

- **Application type**: Web application
- **Name**: AquaRoute web

Under **Authorised JavaScript origins**, press Add URI and add every address the app is
served from. No paths, no trailing slash:

```
https://aquaroute-guwahati.work-jesuneelkamal.workers.dev
http://localhost:8788
```

You can leave **Authorised redirect URIs** empty. This app uses the token flow, which
never redirects.

Press Create. Copy the **Client ID**. It looks like:

```
123456789012-abcdefghijklmnop.apps.googleusercontent.com
```

Ignore the client secret. This flow does not use it, so it never has to leave that page.
The client ID itself is not a secret, which is why it is fine to keep it in the config
file below.

## 4. Put it in the app

Open `wrangler.jsonc` and paste it in:

```jsonc
"vars": { "GOOGLE_CLIENT_ID": "123456789012-abcdefghijklmnop.apps.googleusercontent.com" },
```

Then deploy:

```
npx wrangler deploy
```

Reload the app, press **Report**, and the Google button will be there.

For running it locally, put the same line in a file called `.dev.vars` instead:

```
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnop.apps.googleusercontent.com
```

That file is already in `.gitignore`.

---

## If the button does not appear

Open `/api/config` in the browser. It should show your client ID. If it shows `null`, the
variable did not reach the deployed Worker: check you saved `wrangler.jsonc` and deployed
again.

## If the button appears but signing in fails

Almost always the origin. The address in the browser bar has to match one of the
Authorised JavaScript origins exactly, including `https` against `http` and including the
port. Changes there can take a few minutes to take effect.

---

## What happens to accounts that already exist

Nothing breaks. The email address is what ties the two ways of signing in together:

- Somebody who registered with a password and later presses the Google button with the
  same address gets their existing account, with their existing reports. The Google
  identity is linked on that first use.
- Somebody who starts with Google gets an account with no password at all. If they later
  try the password form, they are told plainly that the account uses Google rather than
  being left guessing at a password they never set.

Google tells us whether it has verified the address, and an unverified one is refused,
which is what makes matching on email safe to do.

## Worth saying out loud in the workshop

The token Google hands the browser is checked by the Worker before it will create a
session, in `src/auth.js`. Three things are checked and all three matter:

1. **Google signed it**, verified against the keys Google publishes.
2. **It was issued for this application.** Skipping this is the classic mistake, because
   a valid Google token from any other app would otherwise let somebody in.
3. **It has not expired.**

The forged-token tests in the build notes cover all three. A token signed with the wrong
key, a token with the algorithm set to `none`, and a malformed one are each refused, and
none of them creates an account.
