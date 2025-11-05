// Variables globales para datos que se cargarán
let MENU_DATA = null;
let ALL_ITEMS_MAP = {}; // Mapa para acceder fácilmente a los ítems por ID
let cart = {}; 
let currentMesa = null; // Variable global para el número de mesa

// --- Funciones de Utilidad ---

// Función para obtener parámetros de la URL (clave para los QR de mesa)
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Función de Haversine para calcular la distancia entre dos coordenadas (en km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (value) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    
    return distance;
}

// Función para calcular el costo de delivery (1$ por km, mínimo 1$)
function getDeliveryCost(distanceKm) {
    const ratePerKm = 1.00;
    const minCost = 1.00;
    return Math.max(minCost, distanceKm * ratePerKm); 
}

// --- Función principal para cargar el menú ---
async function loadMenuData() {
    try {
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            throw new Error('No se pudo cargar menu_data.json');
        }
        const data = await response.json();
        MENU_DATA = data;
        
        // >> LÓGICA DE DETECCIÓN DE MESA <<
        const mesaParam = getUrlParameter('mesa');
        const orderOptionsEl = document.querySelector('.order-options');
        const mesaInfoEl = document.getElementById('mesa-info');
        
        if (mesaParam && !isNaN(parseInt(mesaParam))) {
            currentMesa = parseInt(mesaParam);
            
            // 1. Mostrar la mesa actual
            if (mesaInfoEl) { // Agregamos una verificación de seguridad
                mesaInfoEl.style.display = 'block';
                mesaInfoEl.textContent = `¡Estás pidiendo desde la MESA N° ${currentMesa}! Tu pedido es para comer en local.`;
            }
            
            // 2. Ocultar la opción de Delivery
            if (orderOptionsEl) { // Agregamos una verificación de seguridad
                orderOptionsEl.style.display = 'none';
            }
            
        } else {
            // Si no hay mesa, se asume Delivery o Retiro, y se muestran las opciones
            currentMesa = null;
            if (orderOptionsEl) { // Agregamos una verificación de seguridad
                orderOptionsEl.style.display = 'flex'; 
            }
        }
        
        // 1. Inicializar el mapa de ítems y poblar la información del header
        document.getElementById('promo-container').textContent = data.info.promo;
        document.getElementById('schedule-container').innerHTML = `🕔 **HORARIO DE ATENCIÓN:** ${data.info.schedule}`;
        
        let menuHtml = '';
        data.categories.forEach(category => {
            menuHtml += `
                <section class="menu-category">
                    <h2>${category.name}</h2>
                    <p class="slogan">${category.slogan}</p>
                    <div class="menu-item-list">
            `;

            category.items.forEach(item => {
                ALL_ITEMS_MAP[item.id] = {...item, category_name: category.name};
                
                const topVentaTag = item.top_venta ? '<span class="top-venta-tag">⭐ TOP VENTA</span>' : '';
                
                menuHtml += `
                    <div class="menu-item" data-id="${item.id}">
                        <span class="item-info">${item.name} ${topVentaTag}</span>
                        <div class="item-controls">
                            <span class="price">${item.price.toFixed(2)}$</span>
                            <div class="quantity-control">
                                <button class="quantity-btn" onclick="updateCart('${item.id}', -1)">-</button>
                                <span class="item-quantity">0</span>
                                <button class="quantity-btn" onclick="updateCart('${item.id}', 1)">+</button>
                            </div>
                        </div>
                    </div>
                `;
            });

            menuHtml += `
                    </div>
                </section>
            `;
        });

        document.getElementById('menu-content-container').innerHTML = menuHtml;
        
        // 2. Iniciar el loop de actualización
        updateCartDisplay();
        setInterval(updateCartDisplay, 1000);

    } catch (error) {
        console.error("Error al cargar o renderizar el menú:", error);
        document.getElementById('menu-content-container').innerHTML = `<p style="color:red; text-align:center;">❌ ERROR: No se pudo cargar el menú. Verifica que el archivo **menu_data.json** exista y esté correcto.</p>`;
    }
}


// --- Funciones de Carrito y Display ---
function updateCart(itemId, change) {
    const itemData = ALL_ITEMS_MAP[itemId];
    if (!itemData) return;
    
    let currentQuantity = cart[itemId] ? cart[itemId].quantity : 0;
    let newQuantity = currentQuantity + change;

    if (newQuantity < 0) return;

    if (newQuantity === 0) {
        delete cart[itemId];
    } else {
        cart[itemId] = {
            id: itemId,
            name: itemData.name,
            price: itemData.price,
            category: itemData.category_name,
            quantity: newQuantity
        };
    }

    updateCartDisplay();
}

function updateCartDisplay() {
    if (!MENU_DATA) return;

    let subtotal = 0;
    let totalItems = 0;
    
    for (const id in cart) {
        const item = cart[id];
        subtotal += item.price * item.quantity;
        totalItems += item.quantity;
    }

    // Si es un pedido de mesa, siempre es para consumo en local, ignoramos el checkbox
    const isDelivery = currentMesa ? false : document.getElementById('delivery-checkbox').checked; 
    
    const deliveryDetails = document.getElementById('delivery-details');
    const checkoutBtn = document.getElementById('checkout-btn');

    document.querySelectorAll('.menu-item').forEach(itemEl => {
        const itemId = itemEl.getAttribute('data-id');
        const quantityElement = itemEl.querySelector('.item-quantity');
        quantityElement.textContent = cart[itemId] ? cart[itemId].quantity : 0;
    });

    if (totalItems > 0) {
        checkoutBtn.disabled = false;
    } else {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = `Hacer Pedido por WhatsApp`;
    }
    
    // Lógica de deshabilitación por Límite de tiempo
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        checkoutBtn.disabled = true;
        const remainingSeconds = Math.ceil((COOLDOWN_SECS * 1000 - (now - lastOrderTime)) / 1000);
        checkoutBtn.textContent = `ESPERA: ${remainingSeconds}s para nuevo pedido`;
    }

    // Lógica del Delivery/Mesa y display de totales
    document.getElementById('cart-total-price').textContent = subtotal.toFixed(2);
    
    if (currentMesa) {
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido MESA ${currentMesa} - Total: ${subtotal.toFixed(2)}$`;
        }
    } else if (isDelivery) {
        deliveryDetails.textContent = "Costo de Delivery se calculará al confirmar la ubicación. (1$ por km, mínimo 1$)";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
             checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Subtotal: ${subtotal.toFixed(2)}$`;
        }
    } else {
        deliveryDetails.textContent = "Retiro en Tienda seleccionado.";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Total: ${subtotal.toFixed(2)}$`;
        }
    }

    if (totalItems === 0) {
        document.getElementById('cart-total-price').textContent = "0.00";
    }
}

// --- Lógica de Envío ---

function sendOrder(subtotal, finalTotal, distanceKm, lat, lon) {
    
    const isDelivery = !currentMesa && document.getElementById('delivery-checkbox').checked;
    let message = "🛒 *NUEVO PEDIDO PA QUE WAINER* 🍔\n\n";
    
    for (const id in cart) {
        const item = cart[id];
        const itemSubtotal = item.price * item.quantity;
        message += `*${item.quantity}x* ${item.name} = ${itemSubtotal.toFixed(2)}$\n`;
    }

    message += "\n----------------------------------\n";
    
    if (currentMesa) {
        // Lógica para pedidos de MESA
        message += `📍 *ORDEN DE MESA N°: ${currentMesa}*\n`;
        message += `✅ *SERVICIO:* COMER EN LOCAL 🍽️\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
        
    } else if (isDelivery) {
        // Lógica para pedidos de DELIVERY
        
        // CORRECCIÓN: URL de Google Maps
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
        
        if (distanceKm > 0) {
            const deliveryCost = finalTotal - subtotal;
            
            message += `✅ *SERVICIO:* DELIVERY 🚚\n`;
            message += `📍 *DISTANCIA CALCULADA:* ${distanceKm.toFixed(2)} km\n`;
            message += `💵 *COSTO DELIVERY:* ${deliveryCost.toFixed(2)}$ (1$/km, mínimo 1$)\n`;
            message += `\n*SUBTOTAL (Comida):* ${subtotal.toFixed(2)}$\n`;
            message += `*TOTAL FINAL:* ${finalTotal.toFixed(2)}$\n`;
            message += `🗺️ *UBICACIÓN CLIENTE:* ${mapsUrl}\n`;
            
        } else {
            message += `❌ *SERVICIO:* DELIVERY (FALLIDO) 🚚\n`;
            message += `⚠️ *ATENCIÓN:* No se pudo obtener la ubicación o fue rechazada. El costo de delivery se calculará a la entrega.\n`;
            message += `\n*TOTAL A PAGAR (Comida):* ${subtotal.toFixed(2)}$\n`;
        }
    } else {
        // Lógica para pedidos de RETIRO EN TIENDA
        message += `✅ *SERVICIO:* RETIRO EN TIENDA 🚶\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
    }
    
    message += "----------------------------------\n";
    message += "\nPor favor, indique su nombre.";

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${MENU_DATA.info.whatsapp_number}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
    
    localStorage.setItem('lastOrderTime', Date.now());

    cart = {};
    updateCartDisplay();
}

function checkAndSendOrder() {
    
    if (!MENU_DATA) {
         alert("Error: El menú no se ha cargado correctamente.");
         return;
    }

    // 1. VERIFICACIÓN DEL LÍMITE DE TIEMPO
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        return;
    }
    
    let subtotal = 0;
    for (const id in cart) {
        subtotal += cart[id].price * cart[id].quantity;
    }

    if (Object.keys(cart).length === 0) {
        alert("Por favor, agregue al menos un artículo al carrito antes de hacer el pedido.");
        return;
    }

    // Si es una mesa, saltamos la verificación de Delivery y Geolocalización.
    if (currentMesa) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si NO es una mesa, revisamos si es Delivery o Retiro.
    const isDelivery = document.getElementById('delivery-checkbox').checked;

    if (!isDelivery) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si es Delivery, intentamos obtener la ubicación y calcular
    const checkoutBtn = document.getElementById('checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Calculando envío...';
    document.getElementById('loading-location').style.display = 'block';


    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const clientLat = position.coords.latitude;
                const clientLon = position.coords.longitude;
                
                const ORIGIN_LAT = MENU_DATA.info.origin_lat;
                const ORIGIN_LON = MENU_DATA.info.origin_lon;
                
                const distanceKm = calculateDistance(ORIGIN_LAT, ORIGIN_LON, clientLat, clientLon);
                
                const deliveryCost = getDeliveryCost(distanceKm); 
                
                const finalTotal = subtotal + deliveryCost;

                checkoutBtn.textContent = 'Hacer Pedido';
                document.getElementById('loading-location').style.display = 'none';

                sendOrder(subtotal, finalTotal, distanceKm, clientLat, clientLon);
            },
            (error) => {
                console.error('Error de geolocalización:', error);
                
                checkoutBtn.textContent = 'Hacer Pedido (Envío Pendiente)';
                document.getElementById('loading-location').style.display = 'none';

                sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente
            }
        );
    } else {
        console.error('Geolocalización no soportada.');
        
        checkoutBtn.textContent = 'Hacer Pedido (Envío Pendiente)';
        document.getElementById('loading-location').style.display = 'none';
        
        sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente
    }
}

document.addEventListener('DOMContentLoaded', loadMenuData);

