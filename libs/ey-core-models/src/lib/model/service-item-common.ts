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
import type { ATPCoCategory } from './atpco-category';
import type { EventLog } from './event-log';
import type { FareElement } from './fare-element';
import type { ReasonForIssuance } from './reason-for-issuance';
import type { RichMedia } from './rich-media';
import type { ServiceDescription } from './service-description';
import type { ServiceParameter } from './service-parameter';

/**
 * This object contains a list of detailed information for each service item retrieved from Services catalogue
 */
export interface ServiceItemCommon {
  /**
   * Service id, as defined in services dictionary
   */
  id?: string;
  /**
   * temporary id that can be used to associate requested and returned services. It is only valid the time of the transaction.
   */
  tid?: string;
  /**
   * List of exhaustive descriptions available for the service
   */
  descriptions?: ServiceDescription[];
  reasonForIssuance?: ReasonForIssuance;
  creation?: EventLog;
  /**
   * Quantity of service requested (e.g. Number of bags). In an Order the details of quantity of service for each flight is available in details field. A service quantity can be restricted to a fixed value by configuration in service catalogue
   */
  quantity?: number;
  /**
   * Number of remaining services. Quota is returned only at shopping time
   */
  quota?: number;
  /**
   * Quota status of the services. Quota Status is returned only at shopping time.
   */
  quotaStatus?: ServiceItemCommonQuotaStatus;
  /**
   * Used to specify the tags associated to the service. The tags might refer to the category (e.g. Baggage, Meal, etc.).
   */
  tags?: string[];
  /**
   * Flights to which this service is associated to
   */
  flightIds?: string[];
  /**
   * Operational status. HK = confirmed, HL = waitlist, TK = schedule change confirmed, schedule change waitlist, UN = unable to confirm not operating, UC = unable to confirm, HX = have cancelled, NO = no action taken. Status code is not returned at shopping time
   */
  statusCode?: string;
  /**
   * List of parameters defining the service structure
   */
  parameters?: ServiceParameter[];
  /**
   * List of associated sub-services ids. A service can represent a pack of services and this list will contain the corresponding ids. This field is deprecated. In the context of Order services it is replaced by packDetails.subServiceIds
   */
  subServiceIds?: string[];
  /**
   * Display recommendation ; true if the service is recommended to be highlighted
   */
  isHighlighted?: boolean;
  /**
   * Display recommendation provided by [AAM](http://www.amadeus.com/web/amadeus/en_1A-corporate/Airlines/Airline-Needs/Serve/Differentiate-your-offer/Amadeus-Anytime-Merchandising/1319660801962-Solution_C-AMAD_ProductDetailPpal-1319637765525?industrySegment=1259068355670&level2=1332980613390&level3=1319616835064). This number represents the display order of the services (the lower the number, the more important the service is)
   */
  displayOrder?: number;
  /**
   * List of media associated to the service
   */
  media?: RichMedia[];
  atpcoCategory?: ATPCoCategory;
  /**
   * Fare elements in the TSM (contains endorsement element - code=FE). This is returned only if allowed by the airline on their reservation system and configured in Digital Commerce.
   */
  fareElements?: FareElement[];
}
export enum ServiceItemCommonQuotaStatus {
  Unknown = 'unknown',
  Guaranteed = 'guaranteed',
  Pending = 'pending',
}
