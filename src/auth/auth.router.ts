import { Router } from 'express'
import { omit } from 'ramda'
import { container } from '../container'
import { isAuthenticated } from '../middlewares/isAuthenticated'
import { validate } from '../middlewares/validate'
import {
    LoginInput,
    LoginPayload,
    RegisterInput,
    RegisterPayload
} from './auth.interface'
import { loginValidator, registerValidator } from './auth.validation'

const router = Router()
const { authService, jwtService } = container
router.post('/register', validate(registerValidator), async (req, res) => {
    const input = req.body as RegisterInput
    const user = await authService.registerUser(input)
    const token = await jwtService.generateToken(user)
    const payload: RegisterPayload = { user: omit(['password'], user), token }
    res.json(payload)
})

router.post('/login', validate(loginValidator), async (req, res) => {
    const input = req.body as LoginInput
    const user = await authService.login(input)
    const token = await jwtService.generateToken(user)
    const payload: LoginPayload = { user: omit(['password'], user), token }
    res.json(payload)
})
router.get('/ping', isAuthenticated, async (req, res) => {
    res.json(res.locals.userID)
})
export { router as AuthRouter }
