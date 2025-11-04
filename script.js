// ====================================
// CONFIGURACIÓN
// ====================================
const WHATSAPP_NUMBER = "58412XXXXXXX"; // Reemplaza con tu número de WhatsApp real (con código de país)
const DELIVERY_RATE_PER_KM = 1.00; // Costo por kilómetro
const MINIMUM_DELIVERY_FEE = 1.00; // Tarifa mínima de delivery si se activa

// Ubicación de la tienda (ejemplo en Maracaibo, Venezuela)
const SHOP_LAT = 10.6300; // Latitud de tu negocio
const SHOP_LON = -71.7450; // Longitud de tu negocio

// ====================================
// LÓGICA DEL CARRITO
// ====================================
let cart = []; 
let total = 0;
let deliveryFee = 0;
let userLocation = null;

// Función que se activa al añadir un producto (con o sin opciones)
function addItemWithDetails(name, price, itemElement) {
    let details = [];
    
    // 1. Recoger opciones de Checkbox (si existen en el elemento)
    const checkboxes = itemElement.querySelectorAll('.opciones-grupo input[type="checkbox"]');
    checkboxes.forEach(cb => {
        // Solo agrega la opción si está marcada
        if (cb.checked) {
            details.push(cb.value);
        }
    });

    // 2. Recoger notas de la caja de texto
    const notesBox = itemElement.querySelector('.instrucciones-box');
    const notes = notesBox ? notesBox.value.trim() : '';
    
    if (notes) {
        details.push(`Nota: ${notes}`);
    }

    // 3. Crear el nombre completo del producto
    const itemDetails = details.length > 0 ? ` (${details.join(', ')})` : '';
    const itemName = name + itemDetails;

    // 4. Agregar al carrito
    cart.push({ name: itemName, price: price, basePrice: price }); // basePrice se usa para el cálculo total
    
    // 5. Limpiar la caja de notas después de agregar
    if (notesBox) {
        notesBox.value = '';
        // Desmarcar opciones, excepto "Con Todo" si aplica
        checkboxes.forEach(cb => {
            if (cb.value !== "Con Todo") {
                cb.checked = false;
            } else {
                cb.checked = true; // Mantener "Con Todo" marcado por defecto
            }
        });
    }

    // 6. Actualizar el display
    updateCartDisplay();
    alert(`✅ Añadido: ${name}. Total de items: ${cart.length}`);
}

// Función para actualizar el display del carrito y el botón de checkout
function updateCartDisplay() {
    const totalElement = document.getElementById('cart-total-price');
    const checkoutBtn = document.getElementById('checkout-btn');
    const deliveryCheckbox = document.getElementById('delivery-checkbox');

    // 1. Calcular subtotal del carrito
    let subtotal = cart.reduce((sum, item) => sum + item.basePrice, 0);
    
    // 2. Calcular tarifa de delivery si está marcada
    deliveryFee = 0;
    if (deliveryCheckbox.checked) {
        if (userLocation) {
            // Calcular la tarifa basada en la distancia
            const distance = calculateDistance(SHOP_LAT, SHOP_LON, userLocation.latitude, userLocation.longitude);
            deliveryFee = Math.max(MINIMUM_DELIVERY_FEE, distance * DELIVERY_RATE_PER_KM);
            
            document.getElementById('delivery-details').innerHTML = 
                `Costo de delivery: **${deliveryFee.toFixed(2)}$** (${distance.toFixed(1)} km aprox.)`;
        } else {
            // Si el delivery está marcado, pero la ubicación no se ha obtenido
            deliveryFee = MINIMUM_DELIVERY_FEE; // Usar mínimo hasta obtener ubicación
            document.getElementById('delivery-details').textContent = 
                `Costo de delivery: **${deliveryFee.toFixed(2)}$** (Tarifa mínima - Pendiente cálculo exacto)`;
        }
    } else {
        document.getElementById('delivery-details').textContent = 
            `Seleccione Delivery para calcular el costo. (1$ por km, mínimo 1$)`;
    }

    // 3. Calcular total final
    total = subtotal + deliveryFee;

    // 4. Actualizar el HTML
    totalElement.textContent = total.toFixed(2);
    
    // 5. Habilitar/Deshabilitar botón de pedido
    if (cart.length > 0) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = `Hacer Pedido (${cart.length} productos)`;
    } else {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = `Hacer Pedido por WhatsApp`;
    }
}

// Función principal para generar y enviar el pedido por WhatsApp
function checkAndSendOrder() {
    if (cart.length === 0) {
        alert("Tu carrito está vacío.");
        return;
    }

    // Si delivery está marcado pero no tenemos ubicación, intentar obtenerla
    const deliveryCheckbox = document.getElementById('delivery-checkbox');
    if (deliveryCheckbox.checked && !userLocation) {
        // Esto previene que se envíe el pedido sin la ubicación si el delivery está activo
        alert("Por favor, espere mientras calculamos el delivery o desactive la opción.");
        getLocation(); 
        return;
    }

    sendWhatsAppOrder();
}


function sendWhatsAppOrder() {
    const deliveryCheckbox = document.getElementById('delivery-checkbox');
    let message = `¡Hola Pa que Wainer! Me gustaría hacer un pedido:\n\n`;

    // Detalles de los productos
    cart.forEach((item, index) => {
        message += `${index + 1}. ${item.name} - ${item.basePrice.toFixed(2)}$\n`;
    });

    // Subtotal
    const subtotal = cart.reduce((sum, item) => sum + item.basePrice, 0);
    message += `\n---`;
    message += `\n🛒 Subtotal: ${subtotal.toFixed(2)}$`;

    // Delivery
    if (deliveryCheckbox.checked) {
        message += `\n🚚 Costo Delivery: ${deliveryFee.toFixed(2)}$`;
        if (userLocation) {
            message += ` (Ubicación GPS adjunta)`;
        }
    } else {
        message += `\nRecogeré en tienda.`;
    }

    // Total
    message += `\n💰 **TOTAL FINAL: ${total.toFixed(2)}$**`;
    message += `\n\n*Por favor, confirma mi pedido y el método de pago.*`;

    // Enviar a WhatsApp
    let whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    // CORRECCIÓN: Agregar la ubicación GPS como un mensaje separado para que WhatsApp lo convierta en un link de mapa
    if (userLocation && deliveryCheckbox.checked) {
        const mapLink = `https://www.google.com/maps/search/?api=1&query=${userLocation.latitude},${userLocation.longitude}`;
        whatsappLink += encodeURIComponent(`\n\nMi Ubicación GPS para el Delivery:\n${mapLink}`);
    }

    window.open(whatsappLink, '_blank');
    
    // Opcional: Limpiar carrito después del envío (puedes comentarlo si prefieres confirmación primero)
    // cart = [];
    // total = 0;
    // deliveryFee = 0;
    // updateCartDisplay();
}

// ====================================
// LÓGICA DE UBICACIÓN Y DISTANCIA
// ====================================

// Solicitar ubicación del usuario
function getLocation() {
    if (navigator.geolocation) {
        document.getElementById('loading-location').style.display = 'block';
        document.getElementById('delivery-details').textContent = 'Calculando delivery...';

        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = position.coords;
                document.getElementById('loading-location').style.display = 'none';
                updateCartDisplay(); // Recalcular con la ubicación real
            },
            error => {
                document.getElementById('loading-location').style.display = 'none';
                document.getElementById('delivery-details').textContent = '⚠️ Permiso de ubicación denegado. Se usará la tarifa mínima.';
                userLocation = null;
                updateCartDisplay(); // Recalcular con la tarifa mínima
                console.error("Error al obtener la ubicación:", error);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        document.getElementById('delivery-details').textContent = 'Geolocation no es soportada por este navegador.';
    }
}

// Función para calcular la distancia Haversine (simulación básica)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
}

// ====================================
// INICIALIZACIÓN
// ====================================

// Escucha el cambio en el checkbox de delivery
document.getElementById('delivery-checkbox').addEventListener('change', (event) => {
    if (event.target.checked) {
        getLocation(); // Intentar obtener ubicación al activar delivery
    }
    updateCartDisplay();
});

// Inicializar el carrito al cargar la página
window.onload = function() {
    updateCartDisplay();
    // Puedes poner aquí una promoción o horario fijo si quieres
    document.getElementById('promo-container').textContent = '¡2x1 en Arepas Tradicionales!';
    document.getElementById('schedule-container').textContent = 'Abierto de 5:00 PM a 1:00 AM';
};
