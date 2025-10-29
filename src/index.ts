import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import session from 'express-session'
import passport from 'passport'

import {authRouter} from './modules/auth/routes'
import {userRouter} from './modules/user/routes'
import {microdoseRouter} from './modules/microdose/routes'
import protocolRouter from './modules/protocol/routes'
import journalRouter from './modules/journal/routes'
import notificationRouter from './modules/notification/routes'
import feedbackRouter from './modules/feedback/routes'
import feedbackAdminRouter from './modules/feedback/adminRoutes'
import {communityModule} from './modules/community'
import {errorHandler} from './middleware/errorHandler'
import {notFound} from './middleware/notFound'
import './modules/auth/passport'

const app = express()
const PORT = process.env.PORT || 3000
//
// Security middleware
app.use(helmet())
app.use(
	cors({
		origin: [process.env.APP_BASE_URL || 'https://microdos-web-inky.vercel.app', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5173', 'https://microdos.in', 'https://www.microdos.in'],
		credentials: true
	})
)

// Rate limiting (more lenient for development)
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 1000, // limit each IP to 1000 requests per windowMs (increased for development)
	message: 'Too many requests from this IP, please try again later.',
	skip: (req) => {
		// Skip rate limiting in development
		return process.env.NODE_ENV === 'development'
	}
})
app.use(limiter)

// Body parsing
app.use(express.json({limit: '10mb'}))
app.use(express.urlencoded({extended: true}))

// Session configuration
app.use(
	session({
		secret: process.env.SESSION_SECRET || 'fallback-secret',
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: process.env.NODE_ENV === 'production',
			httpOnly: true,
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			sameSite: 'lax'
		}
	})
)

// Passport middleware
app.use(passport.initialize())
app.use(passport.session())

// Routes
app.use('/api/auth', authRouter)
app.use('/api/user', userRouter)
app.use('/api/microdose', microdoseRouter)
app.use('/api/protocol', protocolRouter)
app.use('/api/journal', journalRouter)
app.use('/api/notification', notificationRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/admin/feedback', feedbackAdminRouter)
app.use('/api/community', communityModule)

// Health check
app.get('/api/health', (_req, res) => {
	res.json({status: 'ok', timestamp: new Date().toISOString()})
})

// Error handling
app.use(notFound)
app.use(errorHandler)

// For Vercel serverless functions, we don't start a server
// The app is exported as the handler
app.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`)
	console.log(`📊 Health check: http://localhost:${PORT}/api/health`)
})

// Export the app for Vercel serverless functions
export default app
