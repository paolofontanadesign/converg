import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')

  if (!query) {
    return NextResponse.json({ error: 'No query provided' }, { status: 400 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${apiKey}`

  try {
    const res = await fetch(url)
    const data = await res.json()

    const results = data.items?.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      published: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.default?.url,
      url: `https://youtube.com/watch?v=${item.id.videoId}`
    })) || []

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}