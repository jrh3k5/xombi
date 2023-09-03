import axios from 'axios';
import dotenv from 'dotenv';
import { MovieSearchResult } from './model.js';

dotenv.config();

// newClient creates a new instance of OmbiClient that can be used to interact with Ombi.
export function newClient() {
    return new OmbiClient();
}

class OmbiClient {
    constructor() {
        this.apiURL = process.env.OMBI_API_URL;
        if (!this.apiURL) {
            throw 'no Ombi API URL found';
        }

        this.apiKey = process.env.OMBI_API_KEY;
        if (!this.apiKey) {
            throw 'no Ombi API key found';
        }
    }

    executeGet(address, url) {
        const username = this.resolveUsername(address);
        if (!username) {
            return new Promise((_, reject) => {
                reject(`Unable to resolve username for address ${address}`)
            })
        }

        return axios({
            url: url,
            method: "GET",
            headers: {
                ApiKey: this.apiKey,
                UserName: username
            }
        });
    }

    executePost(address, url, requestBody) {
        const username = this.resolveUsername(address);
        if (!username) {
            return new Promise((_, reject) => {
                reject(`Unable to resolve username for address ${address}`)
            })
        }

        return axios({
            url: url,
            method: "POST",
            headers: {
                ApiKey: this.apiKey,
                UserName: username
            },
            data: requestBody
        });
    }

    // requestMovie submits a request to add the given MovieSearchResult on behalf of the given address
    requestMovie(address, movieSearchResult) {
        return this.executePost(address, `${this.apiURL}/api/v1/request/movie`, {
            theMovieDbId: movieSearchResult.movieDBID,
            is4kRequest: false,
        })
    }

    // resolveUsername tries to resolve the given address to the associated Ombi username
    resolveUsername(address) {
        return process.env["USERNAME_" + address];
    }

    // searchMovies returns a Promise that resolves to an array of MovieSearchResult objects
    // describing the results of the search term executed on behalf of the given address.
    searchMovies(address, searchTerm) {
        return this.executeGet(address, `${this.apiURL}/api/v1/search/movie/${encodeURIComponent(searchTerm)}`).then(response => {
            return response.data.map(result => {
                return new MovieSearchResult(result.title, new Date(result.releaseDate), result.theMovieDbId);
            })
        })
    }
}