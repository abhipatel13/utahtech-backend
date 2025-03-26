const _ = require('lodash');
// const googleMapsClient = require('@google/maps').createClient({
//     key: process.env.GCP_API_KEY,
//     Promise: Promise
// });
// const turf = require('@turf/turf');
// const polyline = require('@mapbox/polyline');
// const moment = require('moment');
// const messagebird = require('messagebird')(process.env.MSG_BIRD_LIVE_KEY); // Live Key
// const apn = require('apn');

module.exports = {

    /**
     * Date Format Helper
     * ---
     * Converts ISO time String in YY-mm-dd Format
     * 
     * @param timeString String 
     * @param dateFormat String[ymd, dmy, mdy]
     * @param separator String
     * @default dateFormat "ymd"
     * @default separator "-"
     * @returns String
     */

    dateFormat: (timeString, dateFormat = "ymd", separator = "-") => {
        try {
            if (timeString === undefined) {
                throw new Error('Please provide timeString.')
            }
            var date = new Date(timeString);

            var df = dateFormat.split(""); // Date Format
            var dc = []; // Date Container
            dc['y'] = date.getFullYear();
            dc['m'] = date.getMonth() + 1;
            dc['d'] = date.getDate();

            if (dc['d'] < 10) {
                dc['d'] = '0' + dc['d'];
            }
            if (dc['m'] < 10) {
                dc['m'] = '0' + dc['m'];
            }
            return `${dc[df[0]]}${separator}${dc[df[1]]}${separator}${dc[df[2]]}`;

        } catch (err) {
            console.log(err);
            throw new Error(err);
        }
    },

    /**
     * Provide skip and Limit
     * 
     * @param step Number : Number of documents should show per transaction
     * @param pages Number: Current page eg: page-> 1 gives first 10
     * 
     * @returns Object Skip and Limit
     */
    skipLimit: (step, pages) => {
        let skip = (pages - 1) * step;
        let limit = pages * step;
        return {
            skip,
            limit
        };
    },
    /**
     * Escape Regex for Fuzzy search
     * 
     * @param {Search String} text String
     */
    escapeRegex: (text) => {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    },

    /**
     * MAP : Get distance of a point from path
     * ---
     * This will provide the nearest distance of a point from a path. 
     * 
     */




  


    /**
     * Provide date1 and date2
     * 
     * @param date1 Date ISO
     * @param date2 Date ISO
     * 
     * @returns String With date and time range
     */

    getDisplayDate: (date1, date2=null) => {
        return moment(date1).format('DD MMM, hh:mm a');
    },

     
  providerStatus: async (status) =>{
        
            var retVal = "";

            switch (status) 
            {
                case 1: 
                    retVal = "Call";
                    break;

                case 2: 
                    retVal = "Message";
                    break;

                case 3: 
                    retVal = "Video";
                    break;
            }

            return retVal;
    },
      
      InviteUserByEmail : (email,code,period) =>{
        //function InviteUserByEmail(email,code,period) {
        return new Promise(function(resolve, reject) {
          const mailOptions = {
            from: '"Hippa " <support@hippapp.com',
            to: email,
            subject: 'Hippa App Otp Mail',
            html:
            '<!DOCTYPE html><head><title>Internal_email-29</title><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head><body style="margin:0; padding:0;" bgcolor="#eaeced"><table style="min-width:320px;" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eaeced"><tr><td class="hide"><table width="600" cellpadding="0" cellspacing="0" style="width:600px !important;"><tr><td style="min-width:600px; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr><tr><td class="wrapper" style="padding:0 10px;"><table data-module="module-3" data-thumb="thumbnails/03.png" width="100%" cellpadding="0" cellspacing="0"><tr><td data-bgcolor="bg-module" bgcolor="#eaeced"><table class="flexible" width="600" align="center" style="margin:0 auto;background: white;margin-top:30px;" cellpadding="0" cellspacing="0"><tr><td class="img-flex"><img src="https://fipple.com/image/email_logo.png" style="vertical-align:top;margin: 0 auto;display: block; padding: 20px;" width="100px" height="100px" alt=""/><hr style="border:2px solid #00bbf2;width:500px; border-radius:30px;"></td></tr><tr><td data-bgcolor="bg-block" class="holder" style="padding:20px 50px 5px;" bgcolor="#ffffff"><table width="100%" cellpadding="0" cellspacing="0"><tr><td data-color="title" data-size="size title" data-min="20" data-max="40" data-link-color="link title color" data-link-style="text-decoration:none; color:#292c34;" class="title" style="font:30px/33px Arial, Helvetica, sans-serif; color:#292c34; padding:0 0 24px;"><h6 style="margin:0px;">Welcome to Fipple!</h6><p style="font-size: 15px; line-height:20px;">It&apos;s official. You are Invited by Fipple Team to avail a free Subscription for 100 Days. Please <a href="https://dev.fipple.com/#/register/?incode=' + code + '&period=' + period + '" target="_blank">Register with Fipple</a>  to personalize your account and look around</p><p style="font-size: 15px; line-height:20px;">You&apos;ll find tips for getting started, a set up wizard to help you customize Fipple to your needs, a how to guide, and FAQ. If you need a hand, call message support below and we&apos;ll point you in the right direction.</p></td></tr><tr><td style="color:#292c34; border:1px solid #bdbdbd; border-left:0; border-right:0; font:30px/33px Arial, Helvetica, sans-serif; color:#292c34; text-align:left;"><p style="font-size: 15px; line-height:20px;">Powered by <a href="https://www.fipple.com" target="_blank">Fipple</a><br/>Thanks<br/>Team Fipple   </p></td></tr></table></td></tr><tr><td height="28"></td></tr></table></td></tr></table></td></tr></table></body></html>', 
          }
          transporter.sendMail(mailOptions).then(function(info) {
            resolve(info);
          }).catch(function(err) {
              reject(err);
          });
        });
      }

 


}