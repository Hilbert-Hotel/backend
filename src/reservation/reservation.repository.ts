import { Reservation, ReservationModel } from '../models/reservation'
import ReservedBedModel from '../models/reserved_bed'
import RoomModel, { Room } from '../models/room'

export interface ReservationWithRoom extends Reservation {
    rooms: Room[]
}
export interface IReservationRepository {
    findAvailableRooms(check_in: string, check_out: string): Promise<Room[]>
    findAvailableBeds(
        check_in: string,
        check_out: string,
        room_id: number
    ): Promise<Room>
    makeReservation(
        check_in: string,
        check_out: string,
        guest_id: string,
        beds: { id: number }[],
        special_requests: string
    ): Promise<Reservation>
    findRoomsInReservation(reservation_id: string): Promise<Room[]>
    getReservation(reservation_id: string): Promise<ReservationWithRoom>
    getReservationTransaction(reservation_id: string): Promise<Reservation>
}

export class ReservationRepository implements IReservationRepository {
    findAvailableRooms(check_in: string, check_out: string) {
        return RoomModel.query()
            .withGraphJoined('beds', { joinOperation: 'innerJoin' })
            .modifyGraph('beds', bed => {
                bed.fullOuterJoinRelated('reservations')
                    .whereNull('reservations.id')
                    .orWhere('reservations.check_out', '<=', check_in)
                    .orWhere('reservations.check_in', '>', check_out)
                    .select('bed.id')
            })
            .withGraphJoined('photos')
            .modifyGraph('photos', photo => {
                photo.select('photo_url', 'photo_description')
            })
            .withGraphJoined('facilities')
            .orderBy('room.id')
    }
    async findAvailableBeds(
        check_in: string,
        check_out: string,
        room_id: number
    ) {
        return RoomModel.query()
            .findById(room_id)
            .withGraphJoined('beds')
            .modifyGraph('beds', bed => {
                bed.fullOuterJoinRelated('reservations')
                    .whereNull('reservations.id')
                    .orWhere('reservations.check_out', '<=', check_in)
                    .orWhere('reservations.check_in', '>', check_out)
                    .select('bed.id')
                    .orderBy('id', 'ASC')
            })
    }
    async makeReservation(
        check_in: string,
        check_out: string,
        guest_id: string,
        beds: { id: number }[],
        special_requests: string
    ) {
        const reservation = await ReservationModel.query().insert({
            check_in: new Date(check_in),
            check_out: new Date(check_out),
            guest_id,
            special_requests
        })
        const reservedBeds = beds.map(({ id: bed_id }) => ({
            bed_id,
            reservation_id: reservation.id
        }))
        await ReservedBedModel.query()
            .insert(reservedBeds)
            .returning('bed_id')
        return reservation
    }
    findRoomsInReservation(reservation_id: string) {
        return RoomModel.query()
            .withGraphJoined('beds', {
                joinOperation: 'rightJoin'
            })
            .modifyGraph('beds', bed => {
                bed.innerJoinRelated('reservations').where(
                    'reservations.id',
                    '=',
                    reservation_id
                )
            })
    }
    async getReservation(reservation_id: string) {
        const reservation = await ReservationModel.query().findById(
            reservation_id
        )
        const rooms = await this.findRoomsInReservation(reservation_id)
        return {
            ...reservation,
            rooms
        }
    }
    async getReservationTransaction(reservation_id: string) {
        const reservation = await ReservationModel.query()
            .findById(reservation_id)
            .withGraphJoined('transaction')
        return reservation
    }
}
