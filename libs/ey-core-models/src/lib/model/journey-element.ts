/**
 * Amadeus Digital Experience API
 * # API information The document aims at describing the Amadeus Digital Experience API.  Through Digital API, an end user is able to search air offers and related services, add all necessary information to complete a booking, display a seatmap and select seats, add traveler preferences such as meal and finally finalize a booking (creation of an order). API also allows retrieving an existing order. Since the API is REST, operations are not flow related.  ## CRUD operations We do our best to have all our URLs be [RESTful](http://en.wikipedia.org/wiki/Representational_state_transfer). Every endpoint (URL) may support one of five different http verbs. GET requests fetch information about an object, POST requests create objects. PATCH [JSON Merge Patch](https://tools.ietf.org/html/rfc7396) requests perform partial updates.  ## Structure ### The envelope Every response is contained by an envelope. That is, each response has a predictable set of keys with which you can expect to interact: ```json {     \"warnings\": [         ...     ],     \"data\": {         ...     },     \"dictionaries\": {         ...     },     \"errors\": [         ...     ] } ``` #### ERRORS Error messages corresponding to functional blocking issues encountered when processing an operation. When at least one message has a level \'error\' nothing has been processed so no \'data\' are returned. In this case the HTTP status become 200 for POST (instead of 201) and DELETE (instead of 204).  #### WARNINGS Warning messages corresponding to non blocking issues encountered when processing an operation.  #### DATA The data key is the meat of the response. It contains all information regarding the resource requested.  #### DICTIONARIES Each dictionary contains: - localized data : it\'s possible to request for a specific code (e.g. location code) the translation in the language code specified as query parameter. The translation applies as well to the related information: in case of location code, type of location (airport or city), corresponding city (for airport location), state, country, etc.) - dictionarized data : information used on different parts of the message can be defined once and referenced via an id. It that case, the id makes the connection between dictionary and data information Dictionary structure is available on page [Maps in dictionary documentation](../../display/documentation.html#/Maps/get_).  ### Example of request/response When triggering an API operation it is interesting to evaluate the response (or the data model corresponding to the input body in case of POST). ``` GET /carts/{cartId}/travelers/{travelerId} HTTP/1.1 Accept: application/json ```  Multiple errors can occur in response to a single request. The list of error messages is provided by the server: ```json HTTP/1.1 400 Bad Request Content-Type: application/json {   \"errors\": [     {       \"code\": \"04926\",       \"source\": { \"pointer\": \"/names/0/lastName\" },       \"title\": \"INVALID DATA RECEIVED\"       \"detail\": \"must match \\\"^[A-Za-zÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬-ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¿][A-Za-zÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬-ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¿ -.]{1,69}$\\\"     },     {       \"code\": \"36986\",       \"source\": { \"pointer\": \"/0/dateOfBirth\" },       \"detail\": \"Date of birth \'2018-07-01\' should be in the past\",       \"title\": \"INVALID DATA RECEIVED\"     },   ] } ``` Note: example added for illustration only.  A few considerations on the error message structure: - The title communicates the type of problem encountered. - The code refers to an application-specific code representing the type of problem encountered. Code and title have a similar behaviour, since they communicate which is the problem type. However, it is suggested to rely on the code as a unique identifier. - The detail is used to provide information specific to this occurrence of the problem.  Message may use source to point to the top-level of the document (\"\"). The source member can also be used to indicate that the error originated from a problem with a URI query parameter (parameter field used instead of pointer in that case).  Standard [HTTP response status codes](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes) apply. As such they are not all mentioned below.  ## Top resources ### Cart The central resource is the `Cart` (shopping cart) used at shopping time to prepare a journey (shopping, booking and pricing). A `Cart` contains one `AirOffer` and related `Traveler`s, `Service`s, `Seat`s, `FrequentFlyerCard`s,  `Contact`s. At checkout time, an `Order` is created based on content selected from the `Cart`.  ### AirCalendar `Air Calendar` provides the best price per day based on input parameters.  ### AirBound `Air Bound` provides the bound-by-bound shopping proposal based on input parameters. ### AirOffer An `Air Offer` is the result of a shopping proposal. It is a collection of `OfferItem`s, each offer item containing flights.  ### Service The ``Service`` resource allows to access the list of free and/or chargeable services.  ### Seatmap ``Seatmap`` refers to display of the air seat map, allowing the end user to identify the seat to be booked for free or at a charge.  ### Order An ``Order`` corresponds to a reservation record (Amadeus PNRs). The order can contain flights, services and seats, as well as travel documents (E-Tickets and/or EMDs) in case the order has been paid and related tickets issued.  ### Payment Method A `Payment Method` refers to a payment method that be used to pay an order. The following payment methods are supported by DAPI: Payment cards, External  payment, Miles payment and Alternative Payment Method.  ## Secondary resources (main ones) ### Traveler A ``Traveler`` is an individual involved in the booking and taking part in a journey. ### Seat A ``Seat`` refers to the seat that the end user can select as part of the booking. ### Frequent Flyer ``Frequent Flyer`` contains frequent flyer cards either to accrue miles or redeem miles (only accrual supported initially). ### Contact ``Contact`` refers to emails, phone numbers and addresses. ### Travel Document A ``Travel Document`` refers to the tickets (E-Tickets and/or EMDs) issued for flights or services. ### Payment Record A `Payment Record` contains the details of the payment transaction for an order. It includes the payment method used for the order payment, as well additional information such as the approval code for a Credit Card payment. ## Limitations - Only air related content booking is supported. - Only one order is created at a time from the cart. - A cart can only contain one single airOffer.  ## Miscellaneous ### Temporary id (tid) A temporary id (``tid``) can be used to: - identify an object in the request of a POST operation when the id of the object is not known yet.  - identify an object in the response of a PUT operation when the id of the object is changing.  In all cases, a tid is only valid for the time of the transaction   ### Output filtering JSON output can be filtered using ``-fields`` and ``fields`` query parameters, followed by the fully qualified name of the attribute to filter/keep.  Optionally the ``keepRequiredFields`` boolean query parameter can be used to avoid filtering required fields out.  Examples: ``` GET /carts/{cartId}?-fields=data.travelers ``` will filter all travelers out of the response ``` GET /carts/{cartId}?fields=data.travelers.age ``` will keep only age of the travelers in response  Any questions, suggestions or feedbacks, thank you for contacting the DxAPI team  ### Traceability token For better traceability of requests, a traceability token should be added to  every API call as a HTTP header tag: ``Ama-Client-Ref``. This allows a correlation of logs between the client application and the API, enabling: - for the airline or third party developer to provide the session id of their  own application in case of questions/issues (in addition to the usual mandatory fields) - for the Amadeus API developer to extract faster all logs associated to that session and  get a better and faster understanding of the API implementation of the client application  The `Ama-Client-Ref`` should have less than 64 characters. Additional characters are ignored.       The recommended format for this token is composed of both a session part and  a request part resulting in a unique ID for a single request. This recommended format is as following: ``${SESSION_ID}:${REQUEST_ID}``. Where: - ``SESSION_ID``: is a client-side generated token identifying the client-side user session. For example:        - ``123e4567-e89b-12d3-a456-426655440000`` if the application uses    [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier)    in [RFC 4122](https://tools.ietf.org/html/rfc4122)      - ``kGAMfG5by8NaHqZxkQ3oDCpQ6oszEwaIusvbE-6S9x59qZxD_pKH`` if the    application is a J2EE application using a ``JSESSIONID`` as a cookie   - ``REQUEST_ID`` is a client-side request id within the client-side user session matching the ``[a-zA-Z0-9]{1,10}`` format.    - For example: ``1``, ``42``, ``5fa2``, ``Px2z5``, ...    - There is no notion of order between two ``REQUEST_ID``    - ``REQUEST_ID`` must be unique within a session.   Examples:  - Request ``2fc0`` within session ``123e4567-e89b-12d3-a456-426655440000`` traceability token:  ``Ama-Client-Ref: 123e4567-e89b-12d3-a456-426655440000:2fc0``     - Request ``7ba19e`` within session ``123e4567-e89b-12d3-a456-426655440000`` traceability token:  ``Ama-Client-Ref: 123e4567-e89b-12d3-a456-426655440000:7ba19e``  - Request ``7ba19e`` within JSESSIONID session ``kGAMfG5by8NaHqZxkQ3oDCpQ6oszEwaIusvbE-6S9x59qZxD_pKH`` traceability token:  ``Ama-Client-Ref: kGAMfG5by8NaHqZxkQ3oDCpQ6oszEwaIusvbE-6S9x59qZxD_pKH:7ba19e``
 *
 * The version of the OpenAPI document: 2.79.0
 * Contact: DG-CORP-DAPI-Swagger@amadeus.com
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */
import type { BoardingPass } from './boarding-pass';
import type { BoardingPassEligibility } from './boarding-pass-eligibility';
import type { CorporateRecognitionMembership } from './corporate-recognition-membership';
import type { Eligibility } from './eligibility';
import type { FareFamily } from './fare-family';
import type { FrequentFlyerCard } from './frequent-flyer-card';
import type { JourneyElementAcceptance } from './journey-element-acceptance';
import type { Leg } from './leg';
import type { Regrade } from './regrade';
import type { RegulatoryChecks } from './regulatory-checks';
import type { SeatmapEligibility } from './seatmap-eligibility';
import type { SeatmapSeatProperties } from './seatmap-seat-properties';

/**
 * Journey element (traveler on a flight) details.
 */
export interface JourneyElement {
  /**
   * Identifier of the journey element (traveler on a flight).
   */
  id: string;
  /**
   * Traveler Id
   */
  travelerId: string;
  /**
   * Flight id, as defined in flights dictionary.
   */
  flightId: string;
  /**
   * Identifier of the order associated to this journey element
   */
  orderId?: string;
  /**
   * Cabin of the passenger, in single letter format e.g. \"Y\". If a seat is assigned, identical to the cabin defined on the seat
   */
  cabin?: string;
  seat?: SeatmapSeatProperties;
  acceptanceEligibility: Eligibility;
  /**
   * Check-in status of the traveler on the flight
   */
  checkInStatus: JourneyElementCheckInStatus;
  acceptance?: JourneyElementAcceptance;
  boardingPassEligibility: BoardingPassEligibility;
  seatmapEligibility?: SeatmapEligibility;
  boardingPass?: BoardingPass;
  /**
   * Boarding Pass printing status. A needPrinting status means that the boarding pass was printed but need to be printed again because some information changed (seat, class...).
   */
  boardingPassPrintStatus?: JourneyElementBoardingPassPrintStatus;
  frequentFlyerCard?: FrequentFlyerCard;
  /**
   * Indicate if the traveler has boarded his flight. If the flight is outside the Departure Control System window (long before or after departure date), boarding status might be unknown.
   */
  boardingStatus?: JourneyElementBoardingStatus;
  /**
   * Operational status. HK = confirmed, HL = waitlist, TK = schedule change confirmed, schedule change waitlist, UN = unable to confirm not operating, UC = unable to confirm, HX = have cancelled, NO = no action taken.
   */
  bookingStatusCode?: string;
  /**
   * Exit seat suitability. UnableToDetermine suitability will trigger a warning at next touchpoint with an agent in order for him to check the suitability. If suitability is set to notSuitable, the traveler should not be assigned an exit seat.
   */
  exitSeatSuitability?: JourneyElementExitSeatSuitability;
  /**
   * The journey elements linked to this journey. In case of standby early, the standby journey element will contain this link to the ID of the confirmed journey element, and vice versa.
   */
  linkedJourneyElementIds?: string[];
  /**
   * Indicates whether this journey element is a standby early transfer journey element or not. A standby early journey element is created and added to the Journey when a standby early transfer request is done. It is always linked to the confirmed journey element.
   */
  isStandbyEarly?: boolean;
  fareFamily?: FareFamily;
  corporateRecognitionMembership?: CorporateRecognitionMembership;
  regulatoryProgramsCheckStatuses?: RegulatoryChecks[];
  /**
   * Indicates if document submission to APIS(Advance Passenger Information System) is required, and if yes the status of the submission. Complete - required and performed successfully Not Complete - required but not performed successfully Agent Revalidation Required - Complete but document source not trusted, data validation required via document swipe or scan Not Required - not required Not Performed - default status, required but not yet performed
   */
  apisStatus?: JourneyElementApisStatus;
  regrade?: Regrade;
  /**
   * Leg information in case of multi-leg flight.
   */
  legs?: Leg[];
}
export enum JourneyElementCheckInStatus {
  Accepted = 'accepted',
  StandBy = 'standBy',
  NotAccepted = 'notAccepted',
  Rejected = 'rejected',
}
export enum JourneyElementBoardingPassPrintStatus {
  NotPrinted = 'notPrinted',
  Printed = 'printed',
  NeedPrinting = 'needPrinting',
}
export enum JourneyElementBoardingStatus {
  NotBoarded = 'notBoarded',
  Boarded = 'boarded',
  Unknown = 'unknown',
}
export enum JourneyElementExitSeatSuitability {
  Suitable = 'suitable',
  NotSuitable = 'notSuitable',
  UnableToDetermine = 'unableToDetermine',
}
export enum JourneyElementApisStatus {
  Complete = 'COMPLETE',
  AgentRevalRequired = 'AGENT_REVAL_REQUIRED',
  NotRequired = 'NOT_REQUIRED',
  NotPerformed = 'NOT_PERFORMED',
  NotComplete = 'NOT_COMPLETE',
}
