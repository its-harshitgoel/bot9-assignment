const axios = require('axios');
const { Conversation } = require('../models');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const API_KEY = process.env.API_KEY;
console.log("Using API key:", API_KEY);

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  systemInstruction: "You are a room booking assistant Of Hotel Plaza. You should be able to answer questions about room availability and help users book a room."
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-email-password'
  }
});

const sendConfirmationEmail = (email, bookingId) => {
  const mailOptions = {
    from: 'your-email@gmail.com',
    to: email,
    subject: 'Booking Confirmation',
    text: `Your booking is confirmed. Booking ID: ${bookingId}`
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
};

let userSession = {}; // Object to store session data for users

const handleChat = async (req, res) => {
  const { userId, message } = req.body;
  let userState = userSession[userId] || { step: 'welcome' };

  try {
    let botMessage = '';

    switch (userState.step) {
      case 'welcome':
        botMessage = "Welcome to Hotel Plaza! How can I assist you today?";
        userState.step = 'awaiting_intent';
        break;

      case 'awaiting_intent':
        if (message.toLowerCase().includes('book a room')) {
          botMessage = "Certainly! I can help you book a room at Hotel Plaza. Before proceeding, could you please specify your budget?";
          userState.step = 'awaiting_budget';
        } else {
          botMessage = "How can I assist you today? You can say 'book a room' to start the booking process.";
        }
        break;

      case 'awaiting_budget':
        userState.budget = parseInt(message, 10);
        console.log("User budget:", userState.budget);
        const roomsResponse = await axios.get('https://bot9assignement.deno.dev/rooms');
        console.log("Rooms response:", roomsResponse.data);
        const rooms = roomsResponse.data;
        const availableRooms = rooms.filter(room => room.price <= userState.budget);
        console.log("Available rooms:", availableRooms);
        if (availableRooms.length > 0) {
          botMessage = "Here are some available rooms within your budget:\n\n";
          availableRooms.forEach(room => {
            botMessage += `**${room.name}** (ID: ${room.id}): ${room.description}, Price: ${room.price} per night\n`;
          });
          botMessage += "\nPlease select a room by its ID or name for booking.";
          userState.rooms = availableRooms;
          userState.step = 'awaiting_room_selection';
        } else {
          botMessage = "Sorry, there are no rooms available within your budget. Please provide a higher budget or specify other preferences.";
          userState.step = 'awaiting_budget';
        }
        break;

      case 'awaiting_room_selection':
        const selectedRoom = userState.rooms.find(room => 
          message.toLowerCase().includes(room.name.toLowerCase()) || message === room.id.toString()
        );

        if (selectedRoom) {
          userState.selectedRoom = selectedRoom;
          botMessage = `You have selected ${selectedRoom.name}. How many nights would you like to stay?`;
          userState.step = 'awaiting_duration';
        } else {
          botMessage = "I'm sorry, I couldn't understand your selection. Please select a room by its ID or name.";
        }
        break;

      case 'awaiting_duration':
        userState.nights = parseInt(message, 10);
        botMessage = "Great! How many people will be staying?";
        userState.step = 'awaiting_guests';
        break;

      case 'awaiting_guests':
        userState.guests = parseInt(message, 10);
        const totalCost = userState.nights * userState.selectedRoom.price;
        botMessage = `The total cost for ${userState.nights} nights in the ${userState.selectedRoom.name} is ${totalCost}. Do you want to proceed with the booking? (yes/no)`;
        userState.totalCost = totalCost;
        userState.step = 'awaiting_confirmation';
        break;

      case 'awaiting_confirmation':
        if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
          botMessage = "Great! Please provide your full name.";
          userState.step = 'awaiting_name';
        } else {
          botMessage = "Booking process cancelled. How can I assist you further?";
          userState.step = 'welcome';
        }
        break;

      case 'awaiting_name':
        userState.fullName = message;
        botMessage = "Thank you! Please provide your email address.";
        userState.step = 'awaiting_email';
        break;

      case 'awaiting_email':
        userState.email = message;
        // Simulate booking (replace with actual booking logic)
        const bookingResponse = await axios.post('https://bot9assignement.deno.dev/book', {
          roomId: userState.selectedRoom.id,
          fullName: userState.fullName,
          email: userState.email,
          nights: userState.nights,
          guests: userState.guests
        });
        const bookingId = bookingResponse.data.bookingId;
        botMessage = `Your booking is confirmed ${fullName}. Booking ID: ${bookingId}`;
        sendConfirmationEmail(userState.email, bookingId);
        userState = { step: 'welcome' }; // Reset user state after booking
        break;

      default:
        botMessage = "Sorry, I didn't understand that. How can I assist you today?";
        userState.step = 'welcome';
        break;
    }

    userSession[userId] = userState;
    await Conversation.create({ userId, message, response: botMessage });

    res.json({ response: botMessage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
};

module.exports = {
  handleChat
};
