# Ocean Wave Eco Resort Website

A responsive single-page resort website built with plain HTML, CSS and JavaScript.

## Included
- Responsive mobile/tablet/desktop layout
- Ocean Wave Eco Resort branding using the supplied logo and cover image
- Yellow + white + black default visual identity
- 5 theme options: Yellow, Ocean, Forest, Sunset, Dark
- Sticky navigation and mobile menu
- Hero, About, Stays, Experiences, Gallery and Contact sections
- Reservation request form and booking modal
- Smooth scrolling and lightweight vanilla JavaScript
- No build tools or framework required

## Run
Open `index.html` in a browser.

## Before publishing
Replace the placeholder phone/email/address and connect the reservation form to your preferred backend/email/booking platform.


## Booking email delivery
The reservation forms now collect:
- Check-in
- Check-out
- Guests / stay type (main form)
- Customer name
- Customer mobile number
- Customer email
- Customer message (main form)

Forms are configured to submit to `oceanwave.eco.resort@gmail.com` through FormSubmit.

### First-time activation
FormSubmit may require a one-time email activation/confirmation for the destination address. After the first test submission, check `oceanwave.eco.resort@gmail.com` and complete any activation request from FormSubmit.

For a production resort website, a proper backend/email provider is recommended instead of exposing a third-party form endpoint in client-side HTML.
