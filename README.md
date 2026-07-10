# WEEX KOL Finder - Vercel Version

This version is designed for BD users to open the page and search directly without entering a YouTube API key.

## Why this is not GitHub Pages only

GitHub Pages can only host static HTML/CSS/JS. It cannot safely store or rotate 12 YouTube API keys.

Use GitHub as the code repository, then connect the repository to Vercel. Vercel provides the `/api/youtube/...` serverless proxy and stores the API keys in environment variables.

## Project Structure

```text
public/index.html          Frontend page for BD users
api/youtube/[path].js      YouTube API proxy with key pool rotation
package.json
vercel.json
.env.example
```

## Deploy Steps

1. Create a GitHub repository, for example `weex-kol-finder`.
2. Upload all files in this folder to that repository.
3. Go to Vercel and import the GitHub repository.
4. In Vercel project settings, add this environment variable:

```text
YOUTUBE_API_KEYS=key1,key2,key3,key4,key5,key6,key7,key8,key9,key10,key11,key12
```

5. Deploy.
6. Send the Vercel URL to BD users.

## BD Usage

BD users only open the deployed URL. They do not need to enter any API key.

## How Key Rotation Works

The frontend calls:

```text
/api/youtube/search
/api/youtube/channels
/api/youtube/playlistItems
/api/youtube/videos
```

The serverless proxy:

- removes any frontend `key` parameter
- picks one key from `YOUTUBE_API_KEYS`
- retries another key when quota/key errors happen
- temporarily cools down failed keys
- rate limits each IP to reduce accidental quota burn

## Local Test

Install Vercel CLI if needed:

```bash
npm i -g vercel
```

Create `.env.local`:

```text
YOUTUBE_API_KEYS=key1,key2,key3
```

Run:

```bash
vercel dev
```

Open:

```text
http://localhost:3000
```

Do not commit `.env.local`.
