import { PrismaClient } from '@prisma/client'
import { CronJob } from 'cron'

const prisma = new PrismaClient()

const job = new CronJob('* * * * *', async () => {
    const users = await prisma.spotify_data_users.findMany({})
    for (const user of users) {

        try {
            let after: number | undefined

            const lastPlayed = await prisma.spotify_data_song_history.findMany({
                where: {
                    played_by: user.id
                },
                orderBy: {
                    end_at: 'desc'
                },
                take: 1
            })
            if (lastPlayed.length > 0) {
                after = lastPlayed[0].end_at!.getTime()
            }


            let recentlyPlayedRequest = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=30${after != null ? '&after=' + after : ''}`, {
                headers: {
                    'Authorization': `Bearer ${user.access_token}`,
                    'Content-Type': 'application/json'
                },
            })
    
            if(recentlyPlayedRequest.status != 200) {
                const authString = btoa(process.env.CLIENT_ID! + ':' + process.env.CLIENT_SECRET!)
                const refreshTokenRequest = await fetch("https://accounts.spotify.com/api/token", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${authString}`
                    },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: user.refresh_token!,
                    })
                })
                const refreshTokenResponse: refreshTokenResponse = await refreshTokenRequest.json()
                await prisma.spotify_data_users.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        refresh_token: refreshTokenResponse.refresh_token,
                        access_token: refreshTokenResponse.access_token
                    }
                })

                recentlyPlayedRequest = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=30&after=${after}`, {
                    headers: {
                        'Authorization': `Bearer ${refreshTokenResponse.access_token}`
                    },
                })

            }

            const recentSongResponse: recentSongResponse = await recentlyPlayedRequest.json()
            if(recentSongResponse.items.length > 0) {
                await prisma.spotify_data_song_history.createMany({
                    data: recentSongResponse.items.map((track) => {
                        return {
                            title: track.track.name,
                            artist: track.track.artists.map((artist) => artist.name).join(", "),
                            art: track.track.album.images[0].url,
                            spotify_id: track.track.id,
                            played_by: user.id,
                            end_at: new Date(track.played_at),
                            played_at:  new Date(new Date(track.played_at).getTime() - track.track.duration_ms),
                        }
                    })
                })
            }
            console.log(`updated history for ${user.username} (+${recentSongResponse.items.length})`)

        } catch (error) {
            console.log('ERROR: ' + error)
        }
      
    }
})

job.start()

interface recentSongResponse {
    items: {
        played_at: string
        track: {
            name: string
            id: string
            duration_ms: number
            album: {
                images: {
                    url: string
                }[]
            }
            artists: {
                name: string
            }[]
        }
    }[]
}

interface refreshTokenResponse {
    access_token: string,
    refresh_token: string
}