import { expect } from "chai";
import { requestMovie, requestTV } from "../../media/request.js";
import { USER_STATE_MOVIE_SEARCHING, USER_STATE_TV_SEARCHING, setUserState } from "../../state/user_state.js";
import { MovieAlreadyRequestedError, ShowAlreadyRequestedError } from "../../ombi/errors.js";
import { MovieSearchResult, TVSearchResult } from "../../ombi/model.js";

describe("requesting a movie", () => {
    let senderAddress;
    let handlerContext;
    let ombiClient;
    let requestedMovies;
    let alreadyRequestedMovies;
    let replies;

    beforeEach(() => {
        replies = [];
        requestedMovies = {};
        alreadyRequestedMovies = [];

        ombiClient = {};
        ombiClient.requestMovie = async (address, movie) => {
            if (alreadyRequestedMovies.indexOf(movie) >= 0) {
                throw MovieAlreadyRequestedError;
            }

            if (!requestedMovies[address]) {
                requestedMovies[address] = [];
            }

            requestedMovies[address].push(movie);
        }


        senderAddress = "0x1234"

        handlerContext = {
            message: {
                senderAddress: senderAddress
            }
        };
        handlerContext.reply = message => {
            replies.push(message);
            return Promise.resolve();
        }
        
    })

    describe("when the user input is a number", () => {
        beforeEach(() => {
            handlerContext.message.content = "2";
        })

        describe("when there is a user state", () => {
            let userState;

            beforeEach(() => {
                userState = {};
                setUserState(senderAddress, USER_STATE_MOVIE_SEARCHING, userState);
            })

            describe("the user state has search results", () => {
                let movie0;
                let movie1;

                beforeEach(() => {
                    movie0 = new MovieSearchResult(0, "Movie 0");
                    movie1 = new MovieSearchResult(1, "Movie 1");

                    userState.searchResults = [movie0, movie1];
                })

                it("requests the movie", async() => {
                    await requestMovie(ombiClient, handlerContext);

                    expect(requestedMovies[senderAddress]).to.contain(movie1);
                    expect(replies).to.have.lengthOf(1);
                    // the user should have been informed that their selection was enqueued
                    expect(replies[0]).to.satisfy(msg => msg.startsWith("Your request for"));
                })

                describe("when the requested movie is already enqueued", () => {
                    beforeEach(() => {
                        alreadyRequestedMovies.push(movie1);
                    })

                    it("informs the user that the movie has already been requested", async() => {
                        await requestMovie(ombiClient, handlerContext);

                        expect(replies).to.have.lengthOf(1);
                        expect(replies[0]).to.equal("That movie has already been requested.");
                    })
                })
            })
        })
    })

    describe("when it is not a number in the input", () => {
        beforeEach(() => {
            handlerContext.message.content = "not a number";
        })

        it("rejects the request", async() => {
            let caughtError;

            try {
                await requestMovie(ombiClient, handlerContext);
            } catch(e) {
                caughtError = e;
            }
            
            expect(caughtError).to.equal("Invalid input for submitting a request");
        })
    })
})

describe("requesting a TV show", () => {
    let senderAddress;
    let handlerContext;
    let ombiClient;
    let requestedShows;
    let alreadyRequestedShows;
    let replies;

    beforeEach(() => {
        replies = [];
        requestedShows = {};
        alreadyRequestedShows = [];

        ombiClient = {};
        ombiClient.requestTV = async (address, show) => {
            if (alreadyRequestedShows.indexOf(show) >= 0) {
                throw ShowAlreadyRequestedError;
            }

            if (!requestedShows[address]) {
                requestedShows[address] = [];
            }

            requestedShows[address].push(show);
        }


        senderAddress = "0x1234"

        handlerContext = {
            message: {
                senderAddress: senderAddress
            }
        };
        handlerContext.reply = message => {
            replies.push(message);
            return Promise.resolve();
        }
        
    })

    describe("when the user input is a number", () => {
        beforeEach(() => {
            handlerContext.message.content = "2";
        })

        describe("when there is a user state", () => {
            let userState;

            beforeEach(() => {
                userState = {};
                setUserState(senderAddress, USER_STATE_TV_SEARCHING, userState);
            })

            describe("the user state has search results", () => {
                let show0;
                let show1;

                beforeEach(() => {
                    show0 = new TVSearchResult(0, "Show 0");
                    show1 = new TVSearchResult(1, "Show 1");

                    userState.searchResults = [show0, show1];
                })

                it("requests the show", async() => {
                    await requestTV(ombiClient, handlerContext);

                    expect(requestedShows[senderAddress]).to.contain(show1);
                    expect(replies).to.have.lengthOf(1);
                    // the user should have been informed that their selection was enqueued
                    expect(replies[0]).to.satisfy(msg => msg.startsWith("Your request for"));
                })

                describe("when the requested show is already enqueued", () => {
                    beforeEach(() => {
                        alreadyRequestedShows.push(show1);
                    })

                    it("informs the user that the show has already been requested", async() => {
                        await requestTV(ombiClient, handlerContext);

                        expect(replies).to.have.lengthOf(1);
                        expect(replies[0]).to.equal("That TV show has already been requested.");
                    })
                })
            })
        })
    })

    describe("when it is not a number in the input", () => {
        beforeEach(() => {
            handlerContext.message.content = "not a number";
        })

        it("rejects the request", async() => {
            let caughtError;

            try {
                await requestTV(ombiClient, handlerContext);
            } catch(e) {
                caughtError = e;
            }
            
            expect(caughtError).to.equal("Invalid input for submitting a request");
        })
    })
})
