"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const cron_1 = require("cron");
const prisma = new client_1.PrismaClient();
const job = new cron_1.CronJob('* * * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    const users = yield prisma.spotify_data_users.findMany({});
    for (const user of users) {
        try {
            let after;
            const lastPlayed = yield prisma.spotify_data_song_history.findMany({
                where: {
                    played_by: user.id
                },
                orderBy: {
                    end_at: 'desc'
                },
                take: 1
            });
            if (lastPlayed.length > 0) {
                after = lastPlayed[0].end_at.getTime();
            }
            let recentlyPlayedRequest = yield fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50${after != null ? '&after=' + after : ''}`, {
                headers: {
                    'Authorization': `Bearer ${user.access_token}`,
                    'Content-Type': 'application/json'
                },
            });
            let accessToken = user.access_token;
            if (recentlyPlayedRequest.status != 200) {
                const authString = btoa(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET);
                const refreshTokenRequest = yield fetch("https://accounts.spotify.com/api/token", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${authString}`
                    },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: user.refresh_token,
                    })
                });
                const refreshTokenResponse = yield refreshTokenRequest.json();
                accessToken = refreshTokenResponse.access_token;
                yield prisma.spotify_data_users.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        refresh_token: refreshTokenResponse.refresh_token,
                        access_token: refreshTokenResponse.access_token
                    }
                });
                recentlyPlayedRequest = yield fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50&after=${after}`, {
                    headers: {
                        'Authorization': `Bearer ${refreshTokenResponse.access_token}`
                    },
                });
            }
            function getArtistProfilePicture(artistId, accessToken) {
                return __awaiter(this, void 0, void 0, function* () {
                    const checkImage = yield prisma.spotify_data_artist_images.findFirst({
                        where: {
                            spotify_artist_id: artistId
                        }
                    });
                    if (checkImage) {
                        return checkImage.image;
                    }
                    const artistRequest = yield fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });
                    if (artistRequest.status != 200) {
                        return "";
                    }
                    const artistResponse = yield artistRequest.json();
                    if (!artistResponse.images) {
                        return "";
                    }
                    if (artistResponse.images.length == 0) {
                        return "";
                    }
                    yield prisma.spotify_data_artist_images.create({
                        data: {
                            spotify_artist_id: artistId,
                            image: artistResponse.images[0].url
                        }
                    });
                    return artistResponse.images[0].url;
                });
            }
            const recentSongResponse = yield recentlyPlayedRequest.json();
            if (recentSongResponse.items.length > 0) {
                // await prisma.spotify_data_song_history.createMany({
                //     data: recentSongResponse.items.map((track) => {
                //         return {
                //             title: track.track.name,
                //             artist: track.track.artists.map((artist) => artist.name).join(", "),
                //             artist_id: track.track.artists[0]!.id,
                //             artist_art: getArtistProfilePicture(track.track.artists[0]!.id, accessToken!),
                //             art: track.track.album.images[0].url,
                //             spotify_id: track.track.id,
                //             played_by: user.id,
                //             end_at: new Date(track.played_at),
                //             played_at:  new Date(new Date(track.played_at).getTime() - track.track.duration_ms),
                //         }
                //     })
                // })
                for (const song of recentSongResponse.items) {
                    const artistPicture = yield getArtistProfilePicture(song.track.artists[0].id, accessToken);
                    yield prisma.spotify_data_song_history.create({
                        data: {
                            title: song.track.name,
                            artist: song.track.artists.map((artist) => artist.name).join(", "),
                            artist_id: song.track.artists[0].id,
                            artist_art: artistPicture,
                            art: song.track.album.images[0].url,
                            spotify_id: song.track.id,
                            played_by: user.id,
                            end_at: new Date(song.played_at),
                            played_at: new Date(new Date(song.played_at).getTime() - song.track.duration_ms),
                        }
                    });
                }
            }
            console.log(`updated history for ${user.username} (+${recentSongResponse.items.length})`);
        }
        catch (error) {
            console.log('ERROR: ' + error);
        }
    }
}));
job.start();
