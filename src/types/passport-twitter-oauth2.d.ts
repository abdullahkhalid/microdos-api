declare module 'passport-twitter-oauth2' {
  import { Strategy } from 'passport';
  
  interface TwitterOAuth2StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
  }
  
  interface TwitterOAuth2Profile {
    id: string;
    username: string;
    displayName: string;
    emails?: Array<{ value: string; verified?: boolean }>;
    photos?: Array<{ value: string }>;
  }
  
  class TwitterOAuth2Strategy extends Strategy {
    constructor(
      options: TwitterOAuth2StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: TwitterOAuth2Profile,
        done: (error: any, user?: any) => void
      ) => void
    );
  }
  
  export = TwitterOAuth2Strategy;
}
