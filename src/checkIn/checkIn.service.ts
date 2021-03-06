import { evolve, map, pick, pipe } from 'ramda'
import { Dependencies } from '../container'
import { BadRequestError } from '../error/HttpError'
import { IFileService } from '../files/file.service'
import { IGuestRepository } from '../guest/guest.repository'
import { IMailService } from '../mail/mail.service'
import { ReservationDetail } from '../reservation/reservation.interface'
import { randomNumString, renameKeys } from '../utils'
import { OtpReference } from './checkIn.interface'
import { ICheckInRepository } from './checkIn.repository'
import { sameDay } from './checkIn.utils'

export interface ICheckInService {
    getReservationForCheckIn(
        nationalID: string,
        checkIn: Date
    ): Promise<ReservationDetail>
    generateOtp(reservationID: string): Promise<OtpReference>
    verifyOtp(reservationID: string, password: string): Promise<boolean>
    checkIn(
        reservationID: string,
        kioskPhoto: any,
        idCardPhoto: any,
        idCardDetail: any,
        date: Date
    ): Promise<string>
}

export class CheckInService implements ICheckInService {
    checkInRepository: ICheckInRepository
    guestRepository: IGuestRepository
    mailService: IMailService
    fileService: IFileService
    constructor({
        checkInRepository,
        guestRepository,
        mailService,
        fileService
    }: Dependencies<
        ICheckInRepository | IGuestRepository | IMailService | IFileService
    >) {
        this.checkInRepository = checkInRepository
        this.guestRepository = guestRepository
        this.mailService = mailService
        this.fileService = fileService
    }
    async getReservationForCheckIn(nationalID: string, checkIn: Date) {
        const guest = await this.guestRepository.findOneByNationalId(nationalID)
        if (!guest) {
            throw new BadRequestError('User not found.')
        }
        const reservation = await this.checkInRepository.getGuestReservation(
            guest.id,
            checkIn
        )
        if (!reservation) {
            throw new BadRequestError('Reservation not found.')
        }
        if (!reservation.transaction?.paid) {
            throw new BadRequestError('Reservation payment is not complete.')
        }
        if (reservation.check_in_enter_time) {
            throw new BadRequestError('Already checked in.')
        }
        return pipe(
            pick(['id', 'check_in', 'check_out', 'special_requests', 'rooms']),
            evolve({
                rooms: map(evolve({ beds: i => i.length }))
            }),
            renameKeys({
                check_in: 'checkIn',
                check_out: 'checkOut',
                special_requests: 'specialRequests',
                transaction: 'isPaid'
            })
        )(reservation) as ReservationDetail
    }
    async generateOtp(reservationID: string) {
        const password = randomNumString(6)
        const referenceCode = randomNumString(4)
        await this.checkInRepository.createOtp(
            reservationID,
            password,
            referenceCode
        )
        const guest = await this.checkInRepository.getReservationOwner(
            reservationID
        )
        await this.mailService.sendMail({
            text: `Your OTP is ${password}. Reference Code: ${referenceCode}`,
            to: guest.email,
            subject: 'Hilbert Check In OTP'
        })
        return { referenceCode }
    }
    async verifyOtp(reservationID: string, password: string) {
        const otp = await this.checkInRepository.getReservationOtp(
            reservationID
        )
        if (!otp) {
            throw new BadRequestError('Reservation not found.')
        }
        return otp.password === password
    }
    async checkIn(
        reservationID: string,
        kioskPhoto: any,
        idCardPhoto: any,
        idCardDetail: any,
        date: Date
    ) {
        const reservation = await this.checkInRepository.findReservationById(
            reservationID
        )
        if (!reservation) {
            throw new BadRequestError('Invalid Reservation ID')
        }
        if (!reservation.transaction?.paid) {
            throw new BadRequestError('Reservation payment is not complete.')
        }
        if (reservation.check_in_enter_time) {
            throw new BadRequestError('Already checked in.')
        }
        if (!sameDay(date, reservation.check_in)) {
            throw new BadRequestError(`Can not chech in this day ${date}.`)
        }
        const kioskPhotoName = `check-in-photo-${reservationID}.jpg`
        const idCardPhotoName = `id-card-photo-${reservationID}.jpg`
        const kioskPhotoKey = await this.fileService.uploadFile(
            kioskPhoto,
            kioskPhotoName
        )
        const idCardPhotoKey = await this.fileService.uploadFile(
            idCardPhoto,
            idCardPhotoName
        )
        const record = await this.checkInRepository.createReservationRecord(
            reservationID,
            kioskPhotoKey,
            { ...idCardDetail, idCardPhoto: idCardPhotoKey }
        )
        await this.checkInRepository.addCheckInTime(reservationID, date)
        return 'success'
    }
}
