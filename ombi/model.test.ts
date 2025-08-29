import { MovieSearchResult, TVSearchResult } from "./model";

describe("MovieSearchResult", () => {
  describe("getListText", () => {
    it("returns the movie name", () => {
      const movie = new MovieSearchResult("123", "The Matrix");
      expect(movie.getListText()).toBe("The Matrix");
    });
  });
});

describe("TVSearchResult", () => {
  describe("getListText", () => {
    it("includes year when startDate is provided", () => {
      const startDate = new Date("2020-01-15T00:00:00Z");
      const tvShow = new TVSearchResult(
        "456",
        "Breaking Bad",
        startDate,
        5,
        "ended",
      );

      expect(tvShow.getListText()).toBe(
        "Breaking Bad (2020) (5 seasons, ended)",
      );
    });

    it("excludes year when startDate is undefined", () => {
      const tvShow = new TVSearchResult(
        "789",
        "Game of Thrones",
        undefined,
        8,
        "ended",
      );

      expect(tvShow.getListText()).toBe("Game of Thrones (8 seasons, ended)");
    });

    it("uses singular 'season' when seasonCount is 1", () => {
      const startDate = new Date("2019-06-01T00:00:00Z");
      const tvShow = new TVSearchResult(
        "101",
        "Chernobyl",
        startDate,
        1,
        "ended",
      );

      expect(tvShow.getListText()).toBe("Chernobyl (2019) (1 season, ended)");
    });

    it("uses singular 'season' when seasonCount is 1 and no startDate", () => {
      const tvShow = new TVSearchResult(
        "102",
        "Limited Series",
        undefined,
        1,
        "ended",
      );

      expect(tvShow.getListText()).toBe("Limited Series (1 season, ended)");
    });

    it("handles continuing shows", () => {
      const startDate = new Date("2011-04-17T00:00:00Z");
      const tvShow = new TVSearchResult(
        "103",
        "Game of Thrones",
        startDate,
        8,
        "continuing",
      );

      expect(tvShow.getListText()).toBe(
        "Game of Thrones (2011) (8 seasons, continuing)",
      );
    });
  });
});
