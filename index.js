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
            let recentlyPlayedRequest = yield fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=30${after != null ? '&after=' + after : ''}`, {
                headers: {
                    'Authorization': `Bearer ${user.access_token}`,
                    'Content-Type': 'application/json'
                },
            });
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
                yield prisma.spotify_data_users.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        refresh_token: refreshTokenResponse.refresh_token,
                        access_token: refreshTokenResponse.access_token
                    }
                });
                recentlyPlayedRequest = yield fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=30&after=${after}`, {
                    headers: {
                        'Authorization': `Bearer ${refreshTokenResponse.access_token}`
                    },
                });
            }
            const recentSongResponse = yield recentlyPlayedRequest.json();
            yield prisma.spotify_data_song_history.createMany({
                data: recentSongResponse.items.map((track) => {
                    return {
                        title: track.track.name,
                        artist: track.track.artists.map((artist) => artist.name).join(", "),
                        art: track.track.album.images[0].url,
                        spotify_id: track.track.id,
                        played_by: user.id,
                        end_at: new Date(track.played_at),
                        played_at: new Date(new Date(track.played_at).getTime() - track.track.duration_ms),
                    };
                })
            });
            console.log(`updated history for ${user.username} (+${recentSongResponse.items.length})`);
        }
        catch (error) {
            console.log('ERROR: ' + error);
        }
    }
}));
job.start();
