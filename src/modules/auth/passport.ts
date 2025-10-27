import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import TwitterStrategy from 'passport-twitter-oauth2';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Local strategy
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
  },
  async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Twitter OAuth strategy (only if credentials are provided)
if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET && process.env.TWITTER_CALLBACK_URL) {
  passport.use(new TwitterStrategy(
    {
      clientID: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
      callbackURL: process.env.TWITTER_CALLBACK_URL,
    },
  async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      // Check if user already exists with this Twitter account
      const existingAccount = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'twitter',
            providerAccountId: profile.id,
          },
        },
        include: { user: true },
      });

      if (existingAccount) {
        return done(null, existingAccount.user);
      }

      // Check if user exists with same email
      const existingUser = await prisma.user.findUnique({
        where: { email: profile.emails?.[0]?.value },
      });

      if (existingUser) {
        // Link Twitter account to existing user
        await prisma.account.create({
          data: {
            userId: existingUser.id,
            type: 'oauth',
            provider: 'twitter',
            providerAccountId: profile.id,
            access_token: accessToken,
            refresh_token: refreshToken,
          },
        });
        return done(null, existingUser);
      }

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          email: profile.emails?.[0]?.value || '',
          name: profile.displayName,
          image: profile.photos?.[0]?.value,
          emailVerified: new Date(),
        },
      });

      // Create account
      await prisma.account.create({
        data: {
          userId: newUser.id,
          type: 'oauth',
          provider: 'twitter',
          providerAccountId: profile.id,
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      });

      return done(null, newUser);
    } catch (error) {
      return done(error);
    }
  }
  ));
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { accounts: true },
    });
    done(null, user);
  } catch (error) {
    done(error);
  }
});
